-- CreateTable
CREATE TABLE "User" (
    "id" SERIAL NOT NULL,
    "first_name" TEXT NOT NULL,
    "middle_name" TEXT,
    "last_name" TEXT NOT NULL,
    "suffix" TEXT,
    "email" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'Admin',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Sale" (
    "id" SERIAL NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "item_name" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "net_price" DECIMAL(10,2) NOT NULL,
    "items_sold" INTEGER NOT NULL,
    "totalSales" DECIMAL(10,2) NOT NULL,

    CONSTRAINT "Sale_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Log" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Log_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Forecast" (
    "id" SERIAL NOT NULL,
    "item" TEXT NOT NULL,
    "forecastPeriod" TIMESTAMP(3) NOT NULL,
    "forecastValue" DECIMAL(10,2) NOT NULL,
    "mae" DECIMAL(10,4),
    "rmse" DECIMAL(10,4),
    "mape" DECIMAL(10,4),
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Forecast_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "Sale_date_idx" ON "Sale"("date");

-- CreateIndex
CREATE INDEX "Sale_item_name_idx" ON "Sale"("item_name");

-- CreateIndex
CREATE INDEX "Forecast_item_idx" ON "Forecast"("item");
