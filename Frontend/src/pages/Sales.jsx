import { useCallback, useEffect, useRef, useState } from 'react';
import { Archive, Calendar, CheckCircle2, Download, Pencil, Plus, RefreshCcw, RotateCcw, Search, Upload, X } from 'lucide-react';

import api from '../api/axios';
import { useAuth } from '../context/AuthContext';
import Table from '../components/Table';
import Dropdown from '../components/Dropdown';
import ConfirmModal from '../components/ConfirmModal';

const pageSizeOptions = [
  { label: '25 per page', value: 25 },
  { label: '50 per page', value: 50 },
  { label: '100 per page', value: 100 },
  { label: '200 per page', value: 200 },
];

const formatMonth = (value) =>
  new Intl.DateTimeFormat('en', { year: 'numeric', month: 'long' }).format(new Date(value));

const formatCurrency = (value) =>
  new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(Number(value) || 0);

const emptySale = { date: '', item_name: '', category: '', net_price: '', items_sold: '', totalSales: '' };

export default function Sales() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'Admin';
  const [sales, setSales] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const [categoryOptions, setCategoryOptions] = useState([{ label: 'All categories', value: 'all' }]);
  const [itemOptions, setItemOptions] = useState([]);

  const [searchInput, setSearchInput] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [category, setCategory] = useState('all');
  const [month, setMonth] = useState('');
  const [showArchived, setShowArchived] = useState(false);

  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(50);
  const [totalPages, setTotalPages] = useState(1);
  const [totalRows, setTotalRows] = useState(0);

  const [importing, setImporting] = useState(false);
  const [importValidating, setImportValidating] = useState(false);
  const [importModalOpen, setImportModalOpen] = useState(false);
  const [importFile, setImportFile] = useState(null);
  const [importValidation, setImportValidation] = useState(null);
  const [importModalError, setImportModalError] = useState('');
  const [exporting, setExporting] = useState(false);
  const [saleFormOpen, setSaleFormOpen] = useState(false);
  const [editingSale, setEditingSale] = useState(null);
  const [saleForm, setSaleForm] = useState(emptySale);
  const [savingSale, setSavingSale] = useState(false);
  const [saleFormError, setSaleFormError] = useState('');
  const [pendingArchive, setPendingArchive] = useState(null);
  const [selectedSaleIds, setSelectedSaleIds] = useState([]);
  const [itemSearch, setItemSearch] = useState('');
  const [itemPickerOpen, setItemPickerOpen] = useState(false);
  const fileInputRef = useRef(null);
  const latestRequestRef = useRef(0);
  const activeCategoryLabel = categoryOptions.find((option) => option.value === category)?.label || category;

  // Pull the actual categories that exist in the database, once on mount —
  // so this list always reflects real data instead of a hardcoded guess
  useEffect(() => {
    const loadCategories = async () => {
      try {
        const response = await api.get('/sales/categories');
        const options = [
          { label: 'All categories', value: 'all' },
          ...(response.data.categories || []).map((c) => ({ label: c, value: c })),
        ];
        setCategoryOptions(options);
      } catch {
        // Non-fatal — filter just won't have category options if this fails,
        // search/date filtering still works fine on its own
      }
    };

    loadCategories();
  }, []);

  useEffect(() => {
    api.get('/sales/items')
      .then((response) => setItemOptions((response.data.items || []).map((item) =>
        typeof item === 'string' ? { item_name: item, category: '', net_price: 0 } : item,
      )))
      .catch(() => setItemOptions([]));
  }, []);

  // Debounce the search input before it becomes the actual query param —
  // otherwise every keystroke would fire a new request to the backend
  useEffect(() => {
    const timer = window.setTimeout(() => {
      setSearchTerm(searchInput.trim());
      setPage(1);
    }, 400);
    return () => window.clearTimeout(timer);
  }, [searchInput]);

  useEffect(() => {
    setPage(1);
  }, [category, month, limit]);

  const loadSales = useCallback(async () => {
    const requestId = ++latestRequestRef.current;
    setLoading(true);
    setError('');

    try {
      const params = { page, limit, archived: showArchived };

      if (searchTerm) params.item = searchTerm;
      if (category !== 'all') params.category = category;
      if (month) params.month = month;

      const response = await api.get('/sales/table', { params });

      if (requestId !== latestRequestRef.current) return;

      setSales(response.data.sales || []);
      setItemOptions((current) => {
        const byName = new Map(current.map((item) => [item.item_name, item]));
        (response.data.sales || []).forEach((sale) => {
          if (!byName.has(sale.item_name) || !byName.get(sale.item_name).category) {
            byName.set(sale.item_name, {
              item_name: sale.item_name,
              category: sale.category,
              net_price: sale.net_price,
            });
          }
        });
        return [...byName.values()];
      });
      setTotalPages(response.data.totalPages || 1);
      setTotalRows(response.data.totalRows || 0);
    } catch (err) {
      if (requestId !== latestRequestRef.current) return;

      setError(err.response?.data?.error || 'Unable to load sales data right now.');
      setSales([]);
    } finally {
      if (requestId !== latestRequestRef.current) return;

      setLoading(false);
    }
  }, [page, limit, searchTerm, category, month, showArchived]);

  useEffect(() => {
    loadSales();
  }, [loadSales]);

  useEffect(() => {
    if (!success) return undefined;
    const timer = window.setTimeout(() => setSuccess(''), 3000);
    return () => window.clearTimeout(timer);
  }, [success]);

  const handleImportClick = () => {
    setImportFile(null);
    setImportValidation(null);
    setImportModalError('');
    setImportModalOpen(true);
  };

  const handleFileSelected = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setImportFile(file);
    setImportValidation(null);
    setImportModalError('');
    event.target.value = '';
  };

  const closeImportModal = () => {
    if (importing || importValidating) return;
    setImportModalOpen(false);
    setImportFile(null);
    setImportValidation(null);
    setImportModalError('');
  };

  const submitImport = async () => {
    if (!importFile) return;

    setImportModalError('');
    setError('');
    setSuccess('');

    const formData = new FormData();
    formData.append('file', importFile);

    try {
      if (!importValidation) {
        setImportValidating(true);
        const response = await api.post('/sales/import?validateOnly=true', formData, {
          headers: { 'Content-Type': 'multipart/form-data' },
        });
        setImportValidation(response.data);
        return;
      }

      setImporting(true);
      const response = await api.post('/sales/import', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });

      setSuccess(`Imported ${response.data.inserted} of ${response.data.totalRows} rows.`);
      setPage(1);
      await loadSales();

      // A new import might introduce a category that wasn't there before
      try {
        const catResponse = await api.get('/sales/categories');
        const options = [
          { label: 'All categories', value: 'all' },
          ...(catResponse.data.categories || []).map((c) => ({ label: c, value: c })),
        ];
        setCategoryOptions(options);
      } catch {
        // non-fatal, existing category list just won't update
      }
      setImportModalOpen(false);
      setImportFile(null);
      setImportValidation(null);
      setImportModalError('');
    } catch (err) {
      const responseData = err.response?.data;
      if (responseData?.failedRows) {
        setImportValidation(responseData);
      }
      setImportModalError(responseData?.error || 'Import failed.');
    } finally {
      setImportValidating(false);
      setImporting(false);
    }
  };

  const handleExport = async (format) => {
    setExporting(true);
    setError('');

    try {
      const params = { format };
      if (category !== 'all') params.category = category;
      if (month) params.month = month;

      const response = await api.get('/sales/export', {
        params,
        responseType: 'blob',
      });

      const blob = new Blob([response.data]);
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `sales_export.${format}`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      setError(err.response?.data?.error || 'Export failed.');
    } finally {
      setExporting(false);
    }
  };

  const openCreateSale = () => {
    setEditingSale(null);
    setSaleForm({ ...emptySale, date: new Date().toISOString().slice(0, 10) });
    setSaleFormOpen(true);
    setSaleFormError('');
    setItemSearch('');
    setItemPickerOpen(false);
    setError('');
  };

  const toggleSaleSelection = (saleId) => {
    setSelectedSaleIds((current) =>
      current.includes(saleId) ? current.filter((id) => id !== saleId) : [...current, saleId],
    );
  };

  const toggleAllVisibleSales = () => {
    const visibleIds = sales.map((sale) => sale.id);
    setSelectedSaleIds((current) =>
      visibleIds.length > 0 && visibleIds.every((id) => current.includes(id))
        ? current.filter((id) => !visibleIds.includes(id))
        : [...new Set([...current, ...visibleIds])],
    );
  };

  const openEditSale = (sale) => {
    setEditingSale(sale);
    setSaleForm({
      date: sale.month,
      item_name: sale.item_name,
      category: sale.category,
      net_price: sale.net_price,
      items_sold: sale.items_sold,
      totalSales: sale.totalSales,
    });
    setSaleFormOpen(true);
    setSaleFormError('');
    setItemSearch(sale.item_name);
    setItemPickerOpen(false);
    setError('');
  };

  const handleSaleFormChange = (event) => {
    const { name, value } = event.target;
    setSaleForm((current) => {
      const next = { ...current, [name]: value };
      if (name === 'item_name') {
        const selectedItem = itemOptions.find((item) => item.item_name === value)
          || sales.find((item) => item.item_name === value);
        if (selectedItem) {
          next.category = selectedItem.category;
          next.net_price = String(selectedItem.net_price);
          const units = Number(next.items_sold);
          next.totalSales = next.items_sold !== '' && Number.isFinite(units)
            ? (selectedItem.net_price * units).toFixed(2)
            : '';
        }
      }
      if (name === 'net_price' || name === 'items_sold') {
        const price = Number(name === 'net_price' ? value : next.net_price);
        const units = Number(name === 'items_sold' ? value : next.items_sold);
        next.totalSales = Number.isFinite(price) && Number.isFinite(units) ? (price * units).toFixed(2) : '';
      }
      return next;
    });
  };

  const handleItemSelect = (item) => {
    const units = Number(saleForm.items_sold);
    setSaleForm((current) => ({
      ...current,
      item_name: item.item_name,
      category: item.category || '',
      net_price: String(item.net_price ?? ''),
      totalSales: current.items_sold !== '' && Number.isFinite(units)
        ? (Number(item.net_price) * units).toFixed(2)
        : '',
    }));
    setItemSearch(item.item_name);
    setItemPickerOpen(false);
  };

  const handleSaveSale = async (event) => {
    event.preventDefault();
    setSavingSale(true);
    setError('');
    setSaleFormError('');
    try {
      const path = editingSale ? `/sales/${editingSale.id}` : '/sales';
      const response = editingSale ? await api.put(path, saleForm) : await api.post(path, saleForm);
      setSuccess(editingSale ? 'Sale record updated.' : 'Sale record created.');
      setSaleFormOpen(false);
      setEditingSale(null);
      await loadSales();
      if (!editingSale && response.data?.sale?.category && !categoryOptions.some((option) => option.value === response.data.sale.category)) {
        setCategoryOptions((options) => [...options, { label: response.data.sale.category, value: response.data.sale.category }]);
      }
    } catch (err) {
      setSaleFormError(err.response?.data?.error || 'Unable to save sale record.');
    } finally {
      setSavingSale(false);
    }
  };

  const handleArchiveRestore = async () => {
    if (!pendingArchive) return;
    const { sale, sales: selectedSales, restore } = pendingArchive;
    setSavingSale(true);
    setError('');
    try {
      if (selectedSales) {
        await api.patch('/sales/bulk-archive', { ids: selectedSales.map((item) => item.id) });
        setSuccess(`${selectedSales.length} sale records archived.`);
        setSelectedSaleIds([]);
      } else {
        await api.patch(`/sales/${sale.id}/${restore ? 'restore' : 'archive'}`);
        setSuccess(restore ? 'Sale record restored.' : 'Sale record archived.');
      }
      setPendingArchive(null);
      window.dispatchEvent(new Event('sales-data-changed'));
      await loadSales();
    } catch (err) {
      setError(err.response?.data?.error || `Unable to ${restore ? 'restore' : 'archive'} sale record.`);
    } finally {
      setSavingSale(false);
    }
  };

  const columns = [
    ...(isAdmin && !showArchived ? [{
      key: 'select',
      header: (
        <input
          type="checkbox"
          checked={sales.length > 0 && sales.every((sale) => selectedSaleIds.includes(sale.id))}
          onChange={toggleAllVisibleSales}
          aria-label="Select all visible sales"
          className="h-4 w-4 accent-emerald-700"
        />
      ),
      render: (row) => (
        <input
          type="checkbox"
          checked={selectedSaleIds.includes(row.id)}
          onChange={() => toggleSaleSelection(row.id)}
          aria-label={`Select ${row.item_name}`}
          className="h-4 w-4 accent-emerald-700"
        />
      ),
    }] : []),
    {
      key: 'item_name',
      header: 'Item',
      render: (row) => <span className="font-medium text-emerald-950">{row.item_name}</span>,
    },
    {
      key: 'category',
      header: 'Category',
      render: (row) => (
        <span className="inline-flex rounded-full bg-lime-100 px-3 py-1 text-xs font-medium text-lime-900">
          {row.category}
        </span>
      ),
    },
    {
      key: 'month',
      header: 'Month',
      render: (row) => formatMonth(row.month),
    },
    {
      key: 'net_price',
      header: 'Net Price',
      align: 'right',
      render: (row) => formatCurrency(row.net_price),
    },
    {
      key: 'items_sold',
      header: 'Items Sold',
      align: 'right',
      render: (row) => row.items_sold,
    },
    {
      key: 'totalSales',
      header: 'Total Sales',
      align: 'right',
      render: (row) => <span className="font-medium text-emerald-950">{formatCurrency(row.totalSales)}</span>,
    },
    {
      key: 'actions',
      header: 'Actions',
      align: 'right',
      render: (row) => (
        <div className="flex justify-end gap-1">
          {!showArchived && (
            <>
              <button type="button" onClick={() => openEditSale(row)} className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-emerald-700 transition hover:bg-emerald-50" title="Edit sale" aria-label={`Edit ${row.item_name}`}>
                <Pencil className="h-4 w-4" />
              </button>
              <button type="button" onClick={() => setPendingArchive({ sale: row, restore: false })} className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-rose-600 transition hover:bg-rose-50" title="Archive sale" aria-label={`Archive ${row.item_name}`}>
                <Archive className="h-4 w-4" />
              </button>
            </>
          )}
          {showArchived && (
            <button type="button" onClick={() => setPendingArchive({ sale: row, restore: true })} className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-emerald-700 transition hover:bg-emerald-50" title="Restore sale" aria-label={`Restore ${row.item_name}`}>
              <RotateCcw className="h-4 w-4" />
            </button>
          )}
        </div>
      ),
    },
  ];

  return (
    <section className="grid gap-6">
      <div className="rounded-[1.5rem] border border-emerald-900/10 bg-[#fbfaf7] p-6 sm:p-8">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.35em] text-lime-700/70">Sales</p>
            <h1 className="mt-3 text-3xl font-semibold tracking-tight text-emerald-950 sm:text-4xl">
              Sales records
            </h1>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,.xlsx,.xls"
              className="hidden"
              onChange={handleFileSelected}
            />
            {isAdmin && (
              <>
                <button
                  type="button"
                  onClick={openCreateSale}
                  className="inline-flex items-center gap-2 rounded-2xl bg-emerald-800 px-4 py-3 text-sm font-medium text-white shadow-sm transition hover:bg-emerald-700"
                >
                  <Plus className="h-4 w-4" />
                  Add sale
                </button>
                <button
                  type="button"
                  onClick={() => { setShowArchived((value) => !value); setPage(1); }}
                  className={`inline-flex items-center gap-2 rounded-2xl border px-4 py-3 text-sm font-medium transition ${showArchived ? 'border-emerald-800 bg-emerald-50 text-emerald-800' : 'border-emerald-900/10 bg-white text-emerald-900/80 hover:bg-emerald-50'}`}
                >
                  {showArchived ? <RotateCcw className="h-4 w-4" /> : <Archive className="h-4 w-4" />}
                  {showArchived ? 'Active sales' : 'Archived sales'}
                </button>
                {!showArchived && selectedSaleIds.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setPendingArchive({ sales: sales.filter((sale) => selectedSaleIds.includes(sale.id)), restore: false })}
                    className="inline-flex items-center gap-2 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700 transition hover:bg-rose-100"
                  >
                    <Archive className="h-4 w-4" />
                    Archive selected ({selectedSaleIds.length})
                  </button>
                )}
              </>
            )}
            {isAdmin && (
              <button
                type="button"
                onClick={handleImportClick}
                disabled={importing}
                className="inline-flex items-center gap-2 rounded-2xl border border-emerald-900/10 bg-white px-4 py-3 text-sm font-medium text-emerald-900/80 shadow-sm shadow-emerald-950/5 transition hover:bg-emerald-50 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <Upload className="h-4 w-4" />
                {importing ? 'Importing...' : 'Import'}
              </button>
            )}

            <button
              type="button"
              onClick={() => handleExport('csv')}
              disabled={exporting}
              className="inline-flex items-center gap-2 rounded-2xl bg-emerald-950 px-4 py-3 text-sm font-medium text-white shadow-sm shadow-emerald-950/10 transition hover:bg-emerald-900 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <Download className="h-4 w-4" />
              {exporting ? 'Exporting...' : 'Export CSV'}
            </button>
          </div>
        </div>

        <div className="mt-8 grid gap-4 sm:grid-cols-3">
          <article className="rounded-2xl border border-emerald-900/10 bg-white p-4">
            <p className="text-xs uppercase tracking-[0.3em] text-lime-700/60">Total records</p>
            <p className="mt-3 text-2xl font-semibold text-emerald-950">{totalRows}</p>
          </article>

          <article className="rounded-2xl border border-emerald-900/10 bg-white p-4">
            <p className="text-xs uppercase tracking-[0.3em] text-lime-700/60">Months covered</p>
            <p className="mt-3 text-2xl font-semibold text-emerald-950">
              {!month
                ? 'All time'
                : formatMonth(`${month}-01`)}
            </p>
          </article>

          <article className="rounded-2xl border border-emerald-900/10 bg-white p-4">
            <p className="text-xs uppercase tracking-[0.3em] text-lime-700/60">Active category</p>
            <p className="mt-3 text-2xl font-semibold text-emerald-950">{activeCategoryLabel}</p>
          </article>
        </div>
      </div>

      {error && (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
          {error}
        </div>
      )}

      {success && (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          {success}
        </div>
      )}

      <Table
        title="Sales table"
        searchValue={searchInput}
        onSearchChange={setSearchInput}
        searchPlaceholder="Search item name"
        filterValue={category}
        onFilterChange={setCategory}
        filterOptions={categoryOptions}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <label className="flex items-center gap-2 rounded-2xl border border-emerald-900/10 bg-white px-3 py-3 text-sm text-emerald-950 shadow-sm shadow-emerald-950/5">
              <Calendar className="h-4 w-4 shrink-0 text-emerald-900/45" />
              <input
                type="month"
                value={month}
                onChange={(e) => {
                  setMonth(e.target.value);
                  setPage(1);
                }}
                className="bg-transparent text-sm text-emerald-950 outline-none"
              />
            </label>

            {month && (
              <button
                type="button"
                onClick={() => {
                  setMonth('');
                }}
                title="Clear month filter"
                className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-emerald-900/10 bg-white text-emerald-900/60 transition hover:bg-emerald-50 hover:text-emerald-950"
              >
                <RefreshCcw className="h-4 w-4" />
              </button>
            )}
          </div>
        }
        columns={columns}
        data={sales}
        loading={loading}
        emptyState="No sales records match the current search or filter."
        maxHeight="28rem"
      />

      <div className="flex items-center justify-between rounded-[1.5rem] border border-emerald-900/10 bg-[#fbfaf7] px-6 py-4">
        <div className="flex items-center gap-4">
          <p className="text-sm text-emerald-900/60">
            Showing page {page} of {totalPages} ({totalRows} total rows)
          </p>

          <Dropdown value={limit} onChange={setLimit} options={pageSizeOptions} className="w-40" />
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page <= 1}
            className="rounded-xl border border-emerald-900/10 bg-white px-4 py-2 text-sm font-medium text-emerald-900/70 transition hover:bg-emerald-50 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Previous
          </button>
          <button
            type="button"
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page >= totalPages}
            className="rounded-xl border border-emerald-900/10 bg-white px-4 py-2 text-sm font-medium text-emerald-900/70 transition hover:bg-emerald-50 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Next
          </button>
        </div>
      </div>

      {saleFormOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-emerald-950/45 px-4 py-6 backdrop-blur-sm">
          <form onSubmit={handleSaveSale} className="w-full max-w-4xl rounded-[1.5rem] border border-emerald-900/10 bg-[#fbfaf7] p-6 shadow-2xl shadow-emerald-950/25 sm:p-10">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs uppercase tracking-[0.3em] text-lime-700/70">Sales record</p>
                <h2 className="mt-2 text-2xl font-semibold text-emerald-950">{editingSale ? 'Edit sale' : 'Add sale'}</h2>
              </div>
              <button type="button" onClick={() => setSaleFormOpen(false)} className="rounded-xl border border-emerald-900/10 bg-white px-3 py-2 text-sm text-emerald-900/60">Cancel</button>
            </div>
            <div className="mt-6 grid gap-4 sm:grid-cols-2">
              {[
                ['date', 'Date', 'date'],
                ['item_name', 'Item name', 'text'],
                ['category', 'Category', 'text'],
                ['net_price', 'Net price', 'number'],
                ['items_sold', 'Items sold', 'number'],
                ['totalSales', 'Total sales', 'number'],
              ].map(([name, label, type]) => (
                <label key={name} className="grid gap-2 text-sm font-medium text-emerald-900/75">
                  {label}
                  {name === 'item_name' ? (
                    <div className="relative">
                      <div className="flex items-center rounded-xl border border-emerald-900/10 bg-white px-3 py-2.5 focus-within:border-emerald-700/40 focus-within:ring-2 focus-within:ring-emerald-700/10">
                        <Search className="mr-2 h-4 w-4 shrink-0 text-emerald-900/40" />
                        <input
                          value={itemSearch}
                          onChange={(event) => {
                            setItemSearch(event.target.value);
                            setItemPickerOpen(true);
                            if (!event.target.value) handleSaleFormChange({ target: { name, value: '' } });
                          }}
                          onFocus={() => setItemPickerOpen(true)}
                          placeholder="Search and select an item"
                          required={!saleForm.item_name}
                          className="w-full bg-transparent text-sm text-emerald-950 outline-none placeholder:text-emerald-900/40"
                        />
                      </div>
                      {saleFormError && (
                        <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
                          {saleFormError}
                        </div>
                      )}
                      {itemPickerOpen && (
                        <div className="absolute z-20 mt-2 max-h-56 w-full overflow-y-auto rounded-xl border border-emerald-900/10 bg-white p-1 shadow-xl">
                          {itemOptions
                            .filter((item) => item.item_name.toLowerCase().includes(itemSearch.toLowerCase()))
                            .map((item) => (
                              <button
                                key={item.item_name}
                                type="button"
                                onClick={() => {
                                  setItemSearch(item.item_name);
                                  setItemPickerOpen(false);
                                  handleItemSelect(item);
                                }}
                                className="block w-full rounded-lg px-3 py-2 text-left text-sm text-emerald-950 hover:bg-emerald-50"
                              >
                                {item.item_name}
                              </button>
                            ))}
                        </div>
                      )}
                      <input type="hidden" name={name} value={saleForm[name]} required />
                    </div>
                  ) : name === 'category' ? (
                    <input
                      name={name}
                      value={saleForm[name]}
                      readOnly
                      disabled={!editingSale || Boolean(saleForm.item_name)}
                      required
                      placeholder="Auto-filled from item"
                      className="rounded-xl border border-emerald-900/10 bg-emerald-50 px-3 py-2.5 text-sm text-emerald-950 outline-none"
                    />
                  ) : (
                    <input
                      name={name}
                      type={type}
                      min={type === 'number' ? '0' : undefined}
                      step={name === 'items_sold' ? '1' : '0.01'}
                      value={saleForm[name]}
                      onChange={handleSaleFormChange}
                      readOnly={name === 'totalSales' || name === 'net_price'}
                      disabled={name === 'net_price' || name === 'totalSales'}
                      required
                      className="rounded-xl border border-emerald-900/10 bg-white px-3 py-2.5 text-sm text-emerald-950 outline-none focus:border-emerald-700/40 focus:ring-2 focus:ring-emerald-700/10 read-only:bg-emerald-50"
                    />
                  )}
                </label>
              ))}
            </div>
            <button type="submit" disabled={savingSale} className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-800 px-4 py-3 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:opacity-60">
              {savingSale ? 'Saving...' : editingSale ? 'Save changes' : 'Create sale'}
            </button>
          </form>
        </div>
      )}

      {importModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-emerald-950/45 px-4 py-6 backdrop-blur-sm">
          <div className="flex max-h-[90vh] w-full max-w-3xl flex-col rounded-[1.5rem] border border-emerald-900/10 bg-[#fbfaf7] shadow-2xl shadow-emerald-950/25">
            <div className="flex items-start justify-between gap-4 border-b border-emerald-900/10 p-6 sm:p-8">
              <div>
                <p className="text-xs uppercase tracking-[0.3em] text-lime-700/70">Sales import</p>
                <h2 className="mt-2 text-2xl font-semibold text-emerald-950">{importFile ? 'Validate file' : 'Upload file'}</h2>
                {importFile && <p className="mt-2 break-all text-sm text-emerald-900/60">{importFile.name}</p>}
              </div>
              <button type="button" onClick={closeImportModal} disabled={importing || importValidating} className="inline-flex h-10 w-10 items-center justify-center rounded-xl text-emerald-900/60 transition hover:bg-emerald-50 disabled:opacity-40" title="Close import dialog" aria-label="Close import dialog">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="custom-scrollbar overflow-y-auto p-6 sm:p-8">
              {importModalError && !importValidation?.failedRows?.length && (
                <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">{importModalError}</div>
              )}

              {importValidation?.failedRows?.length > 0 ? (
                <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-rose-900">
                  <p className="font-semibold">Import blocked: {importValidation.failedRows.length} row(s) need attention.</p>
                  <p className="mt-1 text-sm">No rows were imported. Fix these rows and select the file again.</p>
                  <div className="mt-4 max-h-72 overflow-y-auto rounded-lg border border-rose-200 bg-white">
                    {importValidation.failedRows.map((failure) => (
                      <div key={failure.row} className="border-b border-rose-100 px-3 py-2 text-sm last:border-b-0">
                        <span className="font-semibold">Row {failure.row}:</span> {failure.reasons?.join('; ')}
                      </div>
                    ))}
                  </div>
                </div>
              ) : importValidation ? (
                <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
                  <div className="flex items-center gap-2 font-semibold"><CheckCircle2 className="h-5 w-5" /> All {importValidation.totalRows} row(s) passed validation.</div>
                  <p className="mt-1">Nothing has been imported yet. Confirm below to continue.</p>
                </div>
              ) : importFile ? (
                <p className="text-sm text-emerald-900/70">The file will be checked row by row before anything is added to sales.</p>
              ) : (
                <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-emerald-900/20 bg-white px-6 py-12 text-center">
                  <Upload className="h-8 w-8 text-emerald-700" />
                  <p className="mt-4 font-semibold text-emerald-950">Choose a sales file to begin</p>
                  <p className="mt-2 text-sm text-emerald-900/60">CSV or Excel files up to 25 MB</p>
                  <button type="button" onClick={() => fileInputRef.current?.click()} className="mt-6 inline-flex items-center gap-2 rounded-xl bg-emerald-800 px-4 py-3 text-sm font-semibold text-white transition hover:bg-emerald-700">
                    <Upload className="h-4 w-4" />
                    Select file
                  </button>
                </div>
              )}
            </div>

            <div className="flex flex-col-reverse gap-3 border-t border-emerald-900/10 p-6 sm:flex-row sm:justify-end sm:p-8">
              <button type="button" onClick={closeImportModal} disabled={importing || importValidating} className="rounded-xl border border-emerald-900/10 bg-white px-4 py-3 text-sm font-medium text-emerald-900/70 transition hover:bg-emerald-50 disabled:opacity-40">Cancel</button>
              {importFile && <button type="button" onClick={submitImport} disabled={importing || importValidating || Boolean(importValidation?.failedRows?.length)} className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-800 px-4 py-3 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60">
                {importValidating ? 'Checking rows...' : importing ? 'Importing...' : importValidation ? 'Import file' : 'Validate file'}
              </button>}
            </div>
          </div>
        </div>
      )}

      <ConfirmModal
        open={Boolean(pendingArchive)}
        title={pendingArchive?.sales ? `Archive ${pendingArchive.sales.length} sale records?` : pendingArchive?.restore ? 'Restore sale record?' : 'Archive sale record?'}
        description={pendingArchive?.sales ? 'These sales will be hidden from the active sales list but can be restored later.' : pendingArchive?.restore ? 'This sale will return to the active sales list.' : 'This sale will be hidden from the active sales list but can be restored later.'}
        confirmLabel={pendingArchive?.sales ? 'Archive selected' : pendingArchive?.restore ? 'Restore sale' : 'Archive sale'}
        confirmIcon={pendingArchive?.restore ? RotateCcw : Archive}
        intent={pendingArchive?.restore ? 'success' : 'danger'}
        loading={savingSale}
        onConfirm={handleArchiveRestore}
        onCancel={() => setPendingArchive(null)}
      />
    </section>
  );
}