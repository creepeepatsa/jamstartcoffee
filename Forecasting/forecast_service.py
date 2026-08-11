import itertools
import logging
import os
import warnings
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime
from typing import Optional

import numpy as np
import pandas as pd
import psycopg2
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Query
from prophet import Prophet
from statsmodels.tsa.arima.model import ARIMA
from statsmodels.tsa.statespace.sarimax import SARIMAX

# Silence Prophet/cmdstanpy's verbose "Log joint probability" console spam
logging.getLogger("cmdstanpy").setLevel(logging.WARNING)
logging.getLogger("prophet").setLevel(logging.WARNING)
# statsmodels throws a lot of convergence/frequency warnings during grid search -- expected, safe to ignore
warnings.filterwarnings("ignore")

load_dotenv()

DATABASE_URL = os.environ.get("DATABASE_URL")
if not DATABASE_URL:
    raise RuntimeError("DATABASE_URL is not set. Check your .env file.")

app = FastAPI(title="Jamstart Coffee - Sales Forecasting Service")

MIN_MONTHS_REQUIRED = 6  # Prophet/ARIMA/SARIMA need a reasonable history to be useful
CATEGORY_FORECAST_MAX_WORKERS = max(1, min(8, (os.cpu_count() or 1)))
CATEGORY_MIN_MONTHS_FOR_PROPHET = 12


def get_connection():
    return psycopg2.connect(DATABASE_URL)


def fetch_monthly_sales(category: Optional[str] = None, item_name: Optional[str] = None) -> pd.DataFrame:
    """Pulls monthly aggregated revenue from the Sale table."""
    conn = get_connection()
    try:
        query = """
            SELECT to_char(date_trunc('month', date), 'YYYY-MM') AS month,
                   SUM("totalSales")::float AS total_revenue,
                   SUM(items_sold)::int AS total_units
            FROM "Sale"
            WHERE 1=1
        """
        params = []

        if category:
            query += ' AND category = %s'
            params.append(category)

        if item_name:
            query += ' AND item_name = %s'
            params.append(item_name)

        query += " GROUP BY date_trunc('month', date) ORDER BY date_trunc('month', date) ASC"

        df = pd.read_sql(query, conn, params=params)
        return df
    finally:
        conn.close()


def fetch_monthly_units_by_category() -> pd.DataFrame:
    """Pulls monthly units sold, grouped by category."""
    conn = get_connection()
    try:
        query = """
            SELECT to_char(date_trunc('month', date), 'YYYY-MM') AS month,
                   category,
                   SUM(items_sold)::int AS total_units
            FROM "Sale"
            GROUP BY date_trunc('month', date), category
            ORDER BY category ASC, month ASC
        """
        df = pd.read_sql(query, conn)
        return df
    finally:
        conn.close()


def run_prophet_forecast(df: pd.DataFrame, months_ahead: int) -> pd.DataFrame:
    prophet_df = df.rename(columns={"month": "ds", "total_revenue": "y"})[["ds", "y"]]
    prophet_df["ds"] = pd.to_datetime(prophet_df["ds"], format="%Y-%m")

    model = Prophet(
        yearly_seasonality=True,
        weekly_seasonality=False,
        daily_seasonality=False,
        uncertainty_samples=200,
    )
    model.fit(prophet_df, iter=300)

    future = model.make_future_dataframe(periods=months_ahead, freq="MS")
    forecast = model.predict(future)

    return forecast[["ds", "yhat", "yhat_lower", "yhat_upper"]].tail(months_ahead)


def run_prophet_units_forecast(category_df: pd.DataFrame, months_ahead: int) -> pd.DataFrame:
    """Same idea as run_prophet_forecast, but works on units sold instead of revenue."""
    prophet_df = category_df.rename(columns={"month": "ds", "total_units": "y"})[["ds", "y"]]
    prophet_df["ds"] = pd.to_datetime(prophet_df["ds"], format="%Y-%m")

    model = Prophet(
        yearly_seasonality=True,
        weekly_seasonality=False,
        daily_seasonality=False,
        uncertainty_samples=100,
    )
    model.fit(prophet_df, iter=200)

    future = model.make_future_dataframe(periods=months_ahead, freq="MS")
    forecast = model.predict(future)

    return forecast[["ds", "yhat", "yhat_lower", "yhat_upper"]].tail(months_ahead)


def run_simple_average_forecast(category_df: pd.DataFrame, months_ahead: int) -> list:
    """
    Fallback for sparse/low-volume categories where Prophet can't converge
    or where there isn't enough history for Prophet to be trustworthy.
    Uses a simple trailing average (+/- 1 std dev) of the last few months instead.
    """
    recent_window = category_df.tail(6)
    avg_units = recent_window["total_units"].mean()
    std_units = recent_window["total_units"].std()
    std_units = 0 if pd.isna(std_units) else std_units

    last_month_str = category_df["month"].iloc[-1]
    last_date = pd.to_datetime(last_month_str, format="%Y-%m")

    forecast = []
    for i in range(1, months_ahead + 1):
        future_date = last_date + pd.DateOffset(months=i)
        forecast.append({
            "month": future_date.strftime("%Y-%m"),
            "predictedUnits": round(max(avg_units, 0)),
            "lowerBound": round(max(avg_units - std_units, 0)),
            "upperBound": round(max(avg_units + std_units, 0)),
        })

    return forecast


def interpret_accuracy(mae: float, rmse: float, mape: Optional[float]) -> dict:
    """
    Translates raw backtest metrics into a plain verdict.

    Ideal ranges:
      - MAPE: <=10% excellent, 10-20% acceptable, >20% poor
      - MAE:  <=5000 good, otherwise high (revenue scale -- if reused for a
              units-based backtest, consider a relative threshold instead)
      - RMSE: should stay close to MAE; a big gap (ratio > 1.5) means
              a few months had much bigger misses than the rest (outliers)
    """
    if mape is None:
        mape_verdict = "n/a"
    elif mape <= 10:
        mape_verdict = "excellent"
    elif mape <= 20:
        mape_verdict = "acceptable"
    else:
        mape_verdict = "poor"

    mae_verdict = "good" if mae <= 5000 else "high"

    if mae == 0:
        rmse_verdict = "n/a"
    else:
        ratio = rmse / mae
        rmse_verdict = "consistent" if ratio <= 1.5 else "inconsistent (possible outlier months)"

    return {
        "mape": mape_verdict,
        "mae": mae_verdict,
        "rmse": rmse_verdict,
    }


def compare_models(results_by_model: dict) -> dict:
    """
    Picks the best-performing model out of however many are passed in
    (e.g. {"prophet": {...}, "arima": {...}, "sarima": {...}}).

    Primary tiebreaker is MAPE (lower is better) since it's scale-independent
    and the most directly interpretable ("on average, X% off"). Falls back to
    MAE, then RMSE, if MAPE is missing or tied across the leading candidates.
    """
    def sort_key(item):
        name, result = item
        mape = result["mape"] if result["mape"] is not None else float("inf")
        mae = result["mae"]
        rmse = result["rmse"]
        return (mape, mae, rmse)

    ranked = sorted(results_by_model.items(), key=sort_key)
    winner_name, winner_result = ranked[0]

    if winner_result["mape"] is not None:
        reason = "lowest MAPE"
    elif winner_result["mae"] is not None:
        reason = "lowest MAE (MAPE unavailable)"
    else:
        reason = "lowest RMSE (MAPE and MAE unavailable)"

    return {
        "winner": winner_name,
        "reason": reason,
        "ranking": [name for name, _ in ranked],
    }


def find_best_arima_order(
    series: pd.Series,
    p_range=range(0, 3),
    d_range=range(0, 2),
    q_range=range(0, 3),
):
    """
    Small grid search over (p, d, q) combinations, scored by AIC (lower is
    better -- balances fit quality against model complexity).
    """
    best_aic = np.inf
    best_order = (1, 1, 1)  # sane fallback if every combination fails to converge

    for p, d, q in itertools.product(p_range, d_range, q_range):
        try:
            fitted = ARIMA(series, order=(p, d, q)).fit()
            if fitted.aic < best_aic:
                best_aic = fitted.aic
                best_order = (p, d, q)
        except Exception:
            continue  # some combos won't converge on short series -- skip them

    return best_order


def find_best_sarima_order(
    series: pd.Series,
    p_range=range(0, 2),
    d_range=range(0, 2),
    q_range=range(0, 2),
    seasonal_p_range=range(0, 2),
    seasonal_d_range=range(0, 2),
    seasonal_q_range=range(0, 2),
    seasonal_period=12,
):
    """
    Grid search over both non-seasonal (p,d,q) and seasonal (P,D,Q,s) terms,
    scored by AIC. Kept narrower than the plain ARIMA search (0-1 instead of
    0-2 per term) since the seasonal search space grows fast -- 2x2x2 seasonal
    x 2x2x2 non-seasonal is already 64 fits per call, and Prophet-scale
    data (~40 monthly points) doesn't need a wider search to find a good fit.
    """
    best_aic = np.inf
    best_order = (1, 1, 1)
    best_seasonal_order = (1, 1, 1, seasonal_period)

    for p, d, q in itertools.product(p_range, d_range, q_range):
        for sp, sd, sq in itertools.product(seasonal_p_range, seasonal_d_range, seasonal_q_range):
            try:
                fitted = SARIMAX(
                    series,
                    order=(p, d, q),
                    seasonal_order=(sp, sd, sq, seasonal_period),
                    enforce_stationarity=False,
                    enforce_invertibility=False,
                ).fit(disp=False)
                if fitted.aic < best_aic:
                    best_aic = fitted.aic
                    best_order = (p, d, q)
                    best_seasonal_order = (sp, sd, sq, seasonal_period)
            except Exception:
                continue

    return best_order, best_seasonal_order


def run_backtest_arima(df: pd.DataFrame, holdout_months: int) -> dict:
    """ARIMA equivalent of run_backtest() -- same train/holdout split on revenue."""
    series_df = df.copy()
    series_df["ds"] = pd.to_datetime(series_df["month"], format="%Y-%m")
    series_df = series_df.set_index("ds")["total_revenue"]
    series_df.index.freq = "MS"

    train_series = series_df.iloc[:-holdout_months]
    test_series = series_df.iloc[-holdout_months:]

    order = find_best_arima_order(train_series)
    model = ARIMA(train_series, order=order).fit()
    predicted_values = model.forecast(steps=holdout_months).values

    actual = test_series.values
    errors = actual - predicted_values
    abs_errors = np.abs(errors)

    mae = float(np.mean(abs_errors))
    rmse = float(np.sqrt(np.mean(errors ** 2)))
    mape = float(np.mean(np.abs(errors / np.where(actual == 0, np.nan, actual))) * 100)

    comparison = [
        {
            "month": test_series.index[i].strftime("%Y-%m"),
            "actualRevenue": round(float(actual[i]), 2),
            "predictedRevenue": round(float(predicted_values[i]), 2),
            "errorAmount": round(float(errors[i]), 2),
            "errorPct": round(float(errors[i] / actual[i] * 100), 2) if actual[i] != 0 else None,
        }
        for i in range(holdout_months)
    ]

    return {
        "order": order,
        "mae": round(mae, 2),
        "rmse": round(rmse, 2),
        "mape": round(mape, 2) if not np.isnan(mape) else None,
        "comparison": comparison,
    }


def run_backtest_units_arima(category_df: pd.DataFrame, holdout_months: int) -> dict:
    """ARIMA equivalent of run_backtest_units() -- same idea, on units instead of revenue."""
    series_df = category_df.copy()
    series_df["ds"] = pd.to_datetime(series_df["month"], format="%Y-%m")
    series_df = series_df.set_index("ds")["total_units"]
    series_df.index.freq = "MS"

    train_series = series_df.iloc[:-holdout_months]
    test_series = series_df.iloc[-holdout_months:]

    order = find_best_arima_order(train_series)
    model = ARIMA(train_series, order=order).fit()
    predicted_values = model.forecast(steps=holdout_months).values

    actual = test_series.values
    errors = actual - predicted_values
    abs_errors = np.abs(errors)

    mae = float(np.mean(abs_errors))
    rmse = float(np.sqrt(np.mean(errors ** 2)))
    mape = float(np.mean(np.abs(errors / np.where(actual == 0, np.nan, actual))) * 100)

    comparison = [
        {
            "month": test_series.index[i].strftime("%Y-%m"),
            "actualUnits": int(actual[i]),
            "predictedUnits": round(float(predicted_values[i])),
            "errorAmount": round(float(errors[i]), 2),
            "errorPct": round(float(errors[i] / actual[i] * 100), 2) if actual[i] != 0 else None,
        }
        for i in range(holdout_months)
    ]

    return {
        "order": order,
        "mae": round(mae, 2),
        "rmse": round(rmse, 2),
        "mape": round(mape, 2) if not np.isnan(mape) else None,
        "comparison": comparison,
    }


def run_backtest_sarima(df: pd.DataFrame, holdout_months: int) -> dict:
    """
    SARIMA equivalent of run_backtest() -- adds seasonal (P,D,Q,12) terms on
    top of ARIMA's (p,d,q), which should help on data like this with clear
    yearly seasonality (holiday peaks, Jan-Mar dips).
    """
    series_df = df.copy()
    series_df["ds"] = pd.to_datetime(series_df["month"], format="%Y-%m")
    series_df = series_df.set_index("ds")["total_revenue"]
    series_df.index.freq = "MS"

    train_series = series_df.iloc[:-holdout_months]
    test_series = series_df.iloc[-holdout_months:]

    order, seasonal_order = find_best_sarima_order(train_series)
    model = SARIMAX(
        train_series,
        order=order,
        seasonal_order=seasonal_order,
        enforce_stationarity=False,
        enforce_invertibility=False,
    ).fit(disp=False)
    predicted_values = model.forecast(steps=holdout_months).values

    actual = test_series.values
    errors = actual - predicted_values
    abs_errors = np.abs(errors)

    mae = float(np.mean(abs_errors))
    rmse = float(np.sqrt(np.mean(errors ** 2)))
    mape = float(np.mean(np.abs(errors / np.where(actual == 0, np.nan, actual))) * 100)

    comparison = [
        {
            "month": test_series.index[i].strftime("%Y-%m"),
            "actualRevenue": round(float(actual[i]), 2),
            "predictedRevenue": round(float(predicted_values[i]), 2),
            "errorAmount": round(float(errors[i]), 2),
            "errorPct": round(float(errors[i] / actual[i] * 100), 2) if actual[i] != 0 else None,
        }
        for i in range(holdout_months)
    ]

    return {
        "order": order,
        "seasonalOrder": seasonal_order,
        "mae": round(mae, 2),
        "rmse": round(rmse, 2),
        "mape": round(mape, 2) if not np.isnan(mape) else None,
        "comparison": comparison,
    }


def run_backtest_units_sarima(category_df: pd.DataFrame, holdout_months: int) -> dict:
    """SARIMA equivalent of run_backtest_units() -- units instead of revenue."""
    series_df = category_df.copy()
    series_df["ds"] = pd.to_datetime(series_df["month"], format="%Y-%m")
    series_df = series_df.set_index("ds")["total_units"]
    series_df.index.freq = "MS"

    train_series = series_df.iloc[:-holdout_months]
    test_series = series_df.iloc[-holdout_months:]

    order, seasonal_order = find_best_sarima_order(train_series)
    model = SARIMAX(
        train_series,
        order=order,
        seasonal_order=seasonal_order,
        enforce_stationarity=False,
        enforce_invertibility=False,
    ).fit(disp=False)
    predicted_values = model.forecast(steps=holdout_months).values

    actual = test_series.values
    errors = actual - predicted_values
    abs_errors = np.abs(errors)

    mae = float(np.mean(abs_errors))
    rmse = float(np.sqrt(np.mean(errors ** 2)))
    mape = float(np.mean(np.abs(errors / np.where(actual == 0, np.nan, actual))) * 100)

    comparison = [
        {
            "month": test_series.index[i].strftime("%Y-%m"),
            "actualUnits": int(actual[i]),
            "predictedUnits": round(float(predicted_values[i])),
            "errorAmount": round(float(errors[i]), 2),
            "errorPct": round(float(errors[i] / actual[i] * 100), 2) if actual[i] != 0 else None,
        }
        for i in range(holdout_months)
    ]

    return {
        "order": order,
        "seasonalOrder": seasonal_order,
        "mae": round(mae, 2),
        "rmse": round(rmse, 2),
        "mape": round(mape, 2) if not np.isnan(mape) else None,
        "comparison": comparison,
    }


def run_backtest(df: pd.DataFrame, holdout_months: int) -> dict:
    """
    Trains Prophet on all data EXCEPT the last `holdout_months`,
    predicts those held-out months, then compares predictions to
    what actually happened.
    """
    prophet_df = df.rename(columns={"month": "ds", "total_revenue": "y"})[["ds", "y"]]
    prophet_df["ds"] = pd.to_datetime(prophet_df["ds"], format="%Y-%m")

    train_df = prophet_df.iloc[:-holdout_months]
    test_df = prophet_df.iloc[-holdout_months:].reset_index(drop=True)

    model = Prophet(
        yearly_seasonality=True,
        weekly_seasonality=False,
        daily_seasonality=False,
    )
    model.fit(train_df)

    future = model.make_future_dataframe(periods=holdout_months, freq="MS")
    forecast = model.predict(future)
    predicted = forecast[["ds", "yhat"]].tail(holdout_months).reset_index(drop=True)

    actual = test_df["y"].values
    predicted_values = predicted["yhat"].values

    errors = actual - predicted_values
    abs_errors = np.abs(errors)

    mae = float(np.mean(abs_errors))
    rmse = float(np.sqrt(np.mean(errors ** 2)))
    mape = float(np.mean(np.abs(errors / np.where(actual == 0, np.nan, actual))) * 100)

    comparison = [
        {
            "month": test_df["ds"].iloc[i].strftime("%Y-%m"),
            "actualRevenue": round(float(actual[i]), 2),
            "predictedRevenue": round(float(predicted_values[i]), 2),
            "errorAmount": round(float(errors[i]), 2),
            "errorPct": round(float(errors[i] / actual[i] * 100), 2) if actual[i] != 0 else None,
        }
        for i in range(holdout_months)
    ]

    return {
        "mae": round(mae, 2),
        "rmse": round(rmse, 2),
        "mape": round(mape, 2) if not np.isnan(mape) else None,
        "comparison": comparison,
    }


def run_backtest_units(category_df: pd.DataFrame, holdout_months: int) -> dict:
    """Same idea as run_backtest(), but for units sold within a single category."""
    prophet_df = category_df.rename(columns={"month": "ds", "total_units": "y"})[["ds", "y"]]
    prophet_df["ds"] = pd.to_datetime(prophet_df["ds"], format="%Y-%m")

    train_df = prophet_df.iloc[:-holdout_months]
    test_df = prophet_df.iloc[-holdout_months:].reset_index(drop=True)

    model = Prophet(
        yearly_seasonality=True,
        weekly_seasonality=False,
        daily_seasonality=False,
    )
    model.fit(train_df)

    future = model.make_future_dataframe(periods=holdout_months, freq="MS")
    forecast = model.predict(future)
    predicted = forecast[["ds", "yhat"]].tail(holdout_months).reset_index(drop=True)

    actual = test_df["y"].values
    predicted_values = predicted["yhat"].values

    errors = actual - predicted_values
    abs_errors = np.abs(errors)

    mae = float(np.mean(abs_errors))
    rmse = float(np.sqrt(np.mean(errors ** 2)))
    mape = float(np.mean(np.abs(errors / np.where(actual == 0, np.nan, actual))) * 100)

    comparison = [
        {
            "month": test_df["ds"].iloc[i].strftime("%Y-%m"),
            "actualUnits": int(actual[i]),
            "predictedUnits": round(float(predicted_values[i])),
            "errorAmount": round(float(errors[i]), 2),
            "errorPct": round(float(errors[i] / actual[i] * 100), 2) if actual[i] != 0 else None,
        }
        for i in range(holdout_months)
    ]

    return {
        "mae": round(mae, 2),
        "rmse": round(rmse, 2),
        "mape": round(mape, 2) if not np.isnan(mape) else None,
        "comparison": comparison,
    }


def _forecast_one_category(category: str, category_df: pd.DataFrame, months_ahead: int) -> dict:
    """
    Fits/forecasts a single category. Runs inside a worker process via
    ProcessPoolExecutor, so it MUST be a top-level function (picklable) --
    it can't be a nested closure or lambda.
    """
    history = [
        {"month": row.month, "actualUnits": int(row.total_units)}
        for row in category_df.itertuples()
    ]

    if len(category_df) < CATEGORY_MIN_MONTHS_FOR_PROPHET:
        return {
            "category": category,
            "history": history,
            "forecast": run_simple_average_forecast(category_df, months_ahead),
            "method": "simple_average",
            "note": f"Not enough history for Prophet (need {CATEGORY_MIN_MONTHS_FOR_PROPHET}+ months, found {len(category_df)}) — used trailing average instead.",
        }

    try:
        forecast_result = run_prophet_units_forecast(category_df, months_ahead)
        forecast = [
            {
                "month": row.ds.strftime("%Y-%m"),
                "predictedUnits": round(max(row.yhat, 0)),
                "lowerBound": round(max(row.yhat_lower, 0)),
                "upperBound": round(max(row.yhat_upper, 0)),
            }
            for row in forecast_result.itertuples()
        ]
        return {
            "category": category,
            "history": history,
            "forecast": forecast,
            "method": "prophet",
        }
    except Exception:
        return {
            "category": category,
            "history": history,
            "forecast": run_simple_average_forecast(category_df, months_ahead),
            "method": "simple_average",
            "note": "Prophet failed to converge on this category's data — used trailing average instead.",
        }


@app.get("/health")
def health_check():
    return {"status": "ok", "time": datetime.utcnow().isoformat(), "version": "v5-prophet-arima-sarima"}


@app.get("/forecast/sales")
def forecast_sales(
    months_ahead: int = Query(3, ge=1, le=24, description="How many months to forecast"),
    category: Optional[str] = Query(None, description="Filter by category"),
    item_name: Optional[str] = Query(None, description="Filter by item name"),
):
    try:
        df = fetch_monthly_sales(category=category, item_name=item_name)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Database error: {str(e)}")

    if df.empty or len(df) < MIN_MONTHS_REQUIRED:
        return {
            "error": f"Not enough historical data to forecast. Need at least {MIN_MONTHS_REQUIRED} months, found {len(df)}.",
            "category": category,
            "item_name": item_name,
        }

    try:
        result = run_prophet_forecast(df, months_ahead)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Forecasting error: {str(e)}")

    history = [
        {
            "month": row.month,
            "actualRevenue": round(row.total_revenue, 2),
            "actualUnits": int(row.total_units),
        }
        for row in df.itertuples()
    ]

    forecast = [
        {
            "month": row.ds.strftime("%Y-%m"),
            "predictedRevenue": round(max(row.yhat, 0), 2),
            "lowerBound": round(max(row.yhat_lower, 0), 2),
            "upperBound": round(max(row.yhat_upper, 0), 2),
        }
        for row in result.itertuples()
    ]

    return {
        "category": category,
        "item_name": item_name,
        "monthsAhead": months_ahead,
        "history": history,
        "forecast": forecast,
    }


@app.get("/forecast/items-by-category")
def forecast_items_by_category(
    months_ahead: int = Query(3, ge=1, le=24, description="How many months to forecast"),
):
    """
    Forecasts expected ITEMS SOLD (units), broken down per category.
    Uses Prophet where there's enough clean history, and falls back to a
    simple trailing average for sparse/low-volume categories.
    """
    try:
        df = fetch_monthly_units_by_category()
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Database error: {str(e)}")

    if df.empty:
        return {"error": "No sales data found."}

    categories = df["category"].unique()
    category_frames = {
        c: df[df["category"] == c].reset_index(drop=True) for c in categories
    }

    results = []
    max_workers = min(CATEGORY_FORECAST_MAX_WORKERS, len(categories)) or 1
    with ThreadPoolExecutor(max_workers=max_workers) as executor:
        futures = {
            executor.submit(_forecast_one_category, c, category_frames[c], months_ahead): c
            for c in categories
        }
        for future in as_completed(futures):
            category = futures[future]
            try:
                results.append(future.result())
            except Exception as e:
                results.append({
                    "category": category,
                    "history": [],
                    "forecast": [],
                    "method": "error",
                    "note": f"Forecast failed: {str(e)}",
                })

    results.sort(key=lambda row: row["category"])

    return {
        "monthsAhead": months_ahead,
        "categories": results,
    }


@app.get("/forecast/backtest")
def backtest_sales(
    holdout_months: int = Query(3, ge=1, le=12, description="How many recent months to hold out and test against"),
    category: Optional[str] = Query(None, description="Filter by category"),
    item_name: Optional[str] = Query(None, description="Filter by item name"),
):
    """
    General sales backtest -- revenue-based, whole-store (or filtered by
    category/item_name if given). Runs Prophet, ARIMA, and SARIMA, and
    returns a bestModel verdict comparing all three on MAPE/MAE/RMSE.
    """
    try:
        df = fetch_monthly_sales(category=category, item_name=item_name)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Database error: {str(e)}")

    min_required = MIN_MONTHS_REQUIRED + holdout_months
    if df.empty or len(df) < min_required:
        return {
            "error": f"Not enough historical data to backtest. Need at least {min_required} months "
                     f"({MIN_MONTHS_REQUIRED} to train + {holdout_months} to hold out), found {len(df)}.",
            "category": category,
            "item_name": item_name,
        }

    try:
        prophet_result = run_backtest(df, holdout_months)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Prophet backtest error: {str(e)}")

    try:
        arima_result = run_backtest_arima(df, holdout_months)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"ARIMA backtest error: {str(e)}")

    try:
        sarima_result = run_backtest_sarima(df, holdout_months)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"SARIMA backtest error: {str(e)}")

    best = compare_models({
        "prophet": prophet_result,
        "arima": arima_result,
        "sarima": sarima_result,
    })

    return {
        "category": category,
        "item_name": item_name,
        "holdoutMonths": holdout_months,
        "prophet": {
            "accuracy": {
                "mae": prophet_result["mae"],
                "rmse": prophet_result["rmse"],
                "mape": prophet_result["mape"],
            },
            "verdict": interpret_accuracy(prophet_result["mae"], prophet_result["rmse"], prophet_result["mape"]),
            "monthByMonth": prophet_result["comparison"],
        },
        "arima": {
            "order": arima_result["order"],
            "accuracy": {
                "mae": arima_result["mae"],
                "rmse": arima_result["rmse"],
                "mape": arima_result["mape"],
            },
            "verdict": interpret_accuracy(arima_result["mae"], arima_result["rmse"], arima_result["mape"]),
            "monthByMonth": arima_result["comparison"],
        },
        "sarima": {
            "order": sarima_result["order"],
            "seasonalOrder": sarima_result["seasonalOrder"],
            "accuracy": {
                "mae": sarima_result["mae"],
                "rmse": sarima_result["rmse"],
                "mape": sarima_result["mape"],
            },
            "verdict": interpret_accuracy(sarima_result["mae"], sarima_result["rmse"], sarima_result["mape"]),
            "monthByMonth": sarima_result["comparison"],
        },
        "bestModel": best,
    }


@app.get("/forecast/backtest-category")
def backtest_category(
    category: str = Query(..., description="Category to backtest (required)"),
    holdout_months: int = Query(3, ge=1, le=12, description="How many recent months to hold out and test against"),
):
    """
    Categorical/units backtest -- separate route from /forecast/backtest
    since this operates on units sold for a single category, not revenue.
    Runs Prophet, ARIMA, and SARIMA, and returns a bestModel verdict.
    """
    try:
        df = fetch_monthly_units_by_category()
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Database error: {str(e)}")

    category_df = df[df["category"] == category].reset_index(drop=True)

    min_required = MIN_MONTHS_REQUIRED + holdout_months
    if category_df.empty or len(category_df) < min_required:
        return {
            "error": f"Not enough historical data to backtest. Need at least {min_required} months "
                     f"({MIN_MONTHS_REQUIRED} to train + {holdout_months} to hold out), found {len(category_df)}.",
            "category": category,
        }

    try:
        prophet_result = run_backtest_units(category_df, holdout_months)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Prophet backtest error: {str(e)}")

    try:
        arima_result = run_backtest_units_arima(category_df, holdout_months)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"ARIMA backtest error: {str(e)}")

    try:
        sarima_result = run_backtest_units_sarima(category_df, holdout_months)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"SARIMA backtest error: {str(e)}")

    best = compare_models({
        "prophet": prophet_result,
        "arima": arima_result,
        "sarima": sarima_result,
    })

    return {
        "category": category,
        "holdoutMonths": holdout_months,
        "prophet": {
            "accuracy": {
                "mae": prophet_result["mae"],
                "rmse": prophet_result["rmse"],
                "mape": prophet_result["mape"],
            },
            "verdict": interpret_accuracy(prophet_result["mae"], prophet_result["rmse"], prophet_result["mape"]),
            "monthByMonth": prophet_result["comparison"],
        },
        "arima": {
            "order": arima_result["order"],
            "accuracy": {
                "mae": arima_result["mae"],
                "rmse": arima_result["rmse"],
                "mape": arima_result["mape"],
            },
            "verdict": interpret_accuracy(arima_result["mae"], arima_result["rmse"], arima_result["mape"]),
            "monthByMonth": arima_result["comparison"],
        },
        "sarima": {
            "order": sarima_result["order"],
            "seasonalOrder": sarima_result["seasonalOrder"],
            "accuracy": {
                "mae": sarima_result["mae"],
                "rmse": sarima_result["rmse"],
                "mape": sarima_result["mape"],
            },
            "verdict": interpret_accuracy(sarima_result["mae"], sarima_result["rmse"], sarima_result["mape"]),
            "monthByMonth": sarima_result["comparison"],
        },
        "bestModel": best,
    }


@app.get("/forecast/categories")
def list_categories():
    """Helper endpoint so the frontend can populate a category dropdown."""
    conn = get_connection()
    try:
        df = pd.read_sql('SELECT DISTINCT category FROM "Sale" ORDER BY category ASC', conn)
        return {"categories": df["category"].tolist()}
    finally:
        conn.close()