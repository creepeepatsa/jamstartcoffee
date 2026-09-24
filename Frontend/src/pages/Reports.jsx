import { useEffect, useState } from 'react';
import { BarChart3, Calendar, ClipboardList, Download, Eye, FileSpreadsheet, FileText, LineChart, Package, X } from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';
import { jsPDF } from 'jspdf';
import api from '../api/axios';

const reports = [
  { key: 'sales_trend', title: 'Sales trend', description: 'Review monthly revenue and units sold across a selected period.', icon: LineChart, accent: 'bg-emerald-100 text-emerald-800' },
  { key: 'forecasting', title: 'Forecasting report', description: 'Export projected sales from the pretrained SARIMA forecasting model.', icon: BarChart3, accent: 'bg-lime-100 text-lime-800' },
];

const monthBounds = (month) => {
  if (!month) return {};
  const [year, monthNumber] = month.split('-').map(Number);
  return { startDate: new Date(Date.UTC(year, monthNumber - 1, 1)).toISOString(), endDate: new Date(Date.UTC(year, monthNumber, 0, 23, 59, 59, 999)).toISOString() };
};
const csvValue = (value) => `"${String(value ?? '').replaceAll('"', '""')}"`;

function downloadFile(content, filename, type) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function downloadExcel(columns, rows, filename) {
  const table = `<table><thead><tr>${columns.map((column) => `<th>${column.header}</th>`).join('')}</tr></thead><tbody>${rows.map((row) => `<tr>${columns.map((column) => `<td>${row[column.key] ?? ''}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
  downloadFile(`<html><meta charset="utf-8"><body>${table}</body></html>`, filename, 'application/vnd.ms-excel');
}

function downloadPdf(title, columns, rows, filename, subtitle) {
  const pdf = new jsPDF({ orientation: columns.length > 4 ? 'landscape' : 'portrait', unit: 'mm' });
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const margin = 14;
  const tableWidth = pageWidth - margin * 2;
  const headerHeight = 30;
  const rowHeight = 8;
  const headerRowHeight = 10;
  const colors = { forest: [6, 78, 59], ink: [20, 55, 42], muted: [88, 116, 103], pale: [235, 247, 239], line: [211, 226, 217], white: [255, 255, 255] };
  const valueFor = (row, column) => String(row[column.key] ?? '-');
  const columnWidth = tableWidth / columns.length;

  const drawPageHeader = (pageNumber) => {
    pdf.setFillColor(...colors.forest);
    pdf.rect(0, 0, pageWidth, headerHeight, 'F');
    pdf.setTextColor(...colors.white);
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(19);
    pdf.text(title, margin, 13);
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(8.5);
    pdf.text(subtitle, margin, 21);
    pdf.setFontSize(8);
    pdf.text(`JAMSTART COFFEE  /  REPORT ${String(pageNumber).padStart(2, '0')}`, pageWidth - margin, 13, { align: 'right' });
  };

  const drawTableHeader = (y) => {
    pdf.setFillColor(...colors.pale);
    pdf.setDrawColor(...colors.line);
    pdf.rect(margin, y, tableWidth, headerRowHeight, 'FD');
    pdf.setTextColor(...colors.forest);
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(8);
    columns.forEach((column, index) => pdf.text(column.header.toUpperCase(), margin + index * columnWidth + 3, y + 6.5));
    return y + headerRowHeight;
  };

  const drawPage = (pageNumber, startIndex, firstPage = false) => {
    if (!firstPage) pdf.addPage();
    drawPageHeader(pageNumber);
    let y = headerHeight + 12;
    if (firstPage) {
      const totalUnits = rows.reduce((sum, row) => sum + (Number(row.items_sold ?? row.predictedValue ?? 0) || 0), 0);
      const cardWidth = (tableWidth - 6) / 2;
      pdf.setFillColor(...colors.pale);
      pdf.roundedRect(margin, y, cardWidth, 18, 2, 2, 'F');
      pdf.roundedRect(margin + cardWidth + 6, y, cardWidth, 18, 2, 2, 'F');
      pdf.setTextColor(...colors.muted);
      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(7.5);
      pdf.text('ROWS IN REPORT', margin + 4, y + 6);
      pdf.text('TOTAL UNITS / PROJECTED', margin + cardWidth + 10, y + 6);
      pdf.setTextColor(...colors.ink);
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(13);
      pdf.text(rows.length.toLocaleString(), margin + 4, y + 14);
      pdf.text(totalUnits.toLocaleString(), margin + cardWidth + 10, y + 14);
      y += 26;
    }
    y = drawTableHeader(y);
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(7.5);
    pdf.setTextColor(...colors.ink);
    let index = startIndex;
    while (index < rows.length && y + rowHeight <= pageHeight - 14) {
      if (index % 2 === 0) {
        pdf.setFillColor(250, 252, 250);
        pdf.rect(margin, y, tableWidth, rowHeight, 'F');
      }
      pdf.setDrawColor(...colors.line);
      pdf.line(margin, y + rowHeight, margin + tableWidth, y + rowHeight);
      columns.forEach((column, columnIndex) => {
        const text = valueFor(rows[index], column).slice(0, Math.max(12, Math.floor(columnWidth / 1.7)));
        pdf.text(text, margin + columnIndex * columnWidth + 3, y + 5.2);
      });
      y += rowHeight;
      index += 1;
    }
    pdf.setTextColor(...colors.muted);
    pdf.setFontSize(7);
    pdf.text(`Page ${pageNumber}  |  Rows ${startIndex + 1}-${index} of ${rows.length}`, pageWidth - margin, pageHeight - 7, { align: 'right' });
    return index;
  };

  let pageNumber = 1;
  let nextIndex = drawPage(pageNumber, 0, true);
  while (nextIndex < rows.length) {
    pageNumber += 1;
    nextIndex = drawPage(pageNumber, nextIndex);
  }
  pdf.save(filename);
}

export default function Reports() {
  const navigate = useNavigate();
  const location = useLocation();
  const [categories, setCategories] = useState([{ label: 'All categories', value: 'all' }]);
  const [activeReport, setActiveReport] = useState(null);
  const [month, setMonth] = useState('');
  const [category, setCategory] = useState('all');
  const [horizon, setHorizon] = useState(3);
  const [preview, setPreview] = useState(null);
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    api.get('/sales/categories')
      .then(({ data }) => setCategories([{ label: 'All categories', value: 'all' }, ...(data.categories || []).map((value) => ({ label: value, value }))]))
      .catch(() => {});
  }, []);

  const openReport = (report) => {
    setActiveReport(report);
    setPreview(null);
    setError('');
    void loadPreview(report);
  };

  const loadPreview = async (report = activeReport) => {
    if (!report) return;
    setLoading(true);
    setError('');
    try {
      if (report.key === 'sales_trend') {
        const params = { reportType: 'mom_report', preview: 'true', ...monthBounds(month) };
        if (category !== 'all') params.category = category;
        const { data } = await api.get('/sales/export', { params });
        setPreview({ ...data, title: report.title });
      } else {
        const { data } = await api.get('/analytics/forecast-pretrained/sarima', { params: { monthsAhead: horizon } });
        const columns = [{ header: 'Month', key: 'month' }, { header: 'Projected units', key: 'predictedValue' }, { header: 'Lower bound', key: 'lowerBound' }, { header: 'Upper bound', key: 'upperBound' }];
        setPreview({ title: report.title, reportType: report.key, columns, rows: data.forecast || [], totalRows: data.forecast?.length || 0 });
      }
    } catch (err) {
      setError(err.response?.data?.error || 'Unable to load this report preview.');
    } finally { setLoading(false); }
  };

  const exportReport = (format) => {
    if (!preview) return;
    setExporting(true);
    const filename = `${activeReport.key}-${month || 'all-time'}`;
    try {
      if (format === 'pdf') {
        const subtitle = activeReport.key === 'sales_trend'
          ? `${month || 'All time'}  /  ${category === 'all' ? 'All categories' : category}`
          : `Next ${horizon} months  /  Pretrained SARIMA`;
        downloadPdf(preview.title, preview.columns, preview.rows, `${filename}.pdf`, subtitle);
      }
      if (format === 'csv') downloadFile(`${preview.columns.map((column) => csvValue(column.header)).join(',')}\n${preview.rows.map((row) => preview.columns.map((column) => csvValue(row[column.key])).join(',')).join('\n')}`, `${filename}.csv`, 'text/csv;charset=utf-8');
      if (format === 'xlsx') downloadExcel(preview.columns, preview.rows, `${filename}.xls`);
    } finally { setExporting(false); }
  };

  return (
    <section className="grid gap-6">
      <div className="overflow-hidden rounded-[1.5rem] border border-emerald-900/10 bg-[#fbfaf7] shadow-sm shadow-emerald-950/5">
        <div className="flex items-start gap-4 border-b border-emerald-900/10 px-6 py-5"><div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-emerald-200 bg-emerald-50 text-emerald-700"><Package className="h-5 w-5" /></div><div><h2 className="text-3xl font-semibold tracking-tight text-emerald-950">Sales Management</h2><p className="mt-1 text-sm text-emerald-900/65">Explore trends and export focused reports.</p></div></div>
        <div className="flex items-center gap-2 px-5 pt-3"><button type="button" onClick={() => navigate('/sales')} className={`inline-flex items-center gap-2 border-b-2 px-3 py-2 text-sm font-medium ${location.pathname === '/sales' ? 'border-emerald-700 text-emerald-700' : 'border-transparent text-emerald-900/70'}`}><ClipboardList className="h-4 w-4" />Sales Records</button><button type="button" onClick={() => navigate('/reports')} className={`inline-flex items-center gap-2 border-b-2 px-3 py-2 text-sm font-medium ${location.pathname === '/reports' ? 'border-emerald-700 text-emerald-700' : 'border-transparent text-emerald-900/70'}`}><BarChart3 className="h-4 w-4" />Reports</button></div>
      </div>
      <section className="rounded-[1.75rem] border border-emerald-900/10 bg-[#fbfaf7] p-6 shadow-sm shadow-emerald-950/5 sm:p-8"><div className="mb-6 flex items-center gap-3"><FileText className="h-5 w-5 text-emerald-700" /><div><h1 className="text-xl font-semibold text-emerald-950">Choose a report</h1><p className="text-sm text-emerald-900/60">Open a report to filter, preview, and export it.</p></div></div><div className="grid gap-4 md:grid-cols-2">{reports.map((report) => { const Icon = report.icon; return <button key={report.key} type="button" onClick={() => openReport(report)} className="group flex items-start gap-4 rounded-2xl border border-emerald-900/10 bg-white p-5 text-left transition hover:-translate-y-0.5 hover:border-emerald-700/30 hover:shadow-md"><span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${report.accent}`}><Icon className="h-5 w-5" /></span><span className="min-w-0"><strong className="block text-base text-emerald-950">{report.title}</strong><span className="mt-1 block text-sm leading-5 text-emerald-900/60">{report.description}</span><span className="mt-4 inline-flex items-center gap-2 text-sm font-semibold text-emerald-700">Configure report <Eye className="h-4 w-4" /></span></span></button>; })}</div></section>
  {activeReport && <div className="fixed inset-0 z-50 flex items-center justify-center bg-emerald-950/55 px-4 py-6 backdrop-blur-sm"><div className="flex max-h-[92vh] w-full max-w-6xl flex-col overflow-hidden rounded-[1.5rem] border border-emerald-200/40 bg-[#fbfaf7] shadow-2xl shadow-emerald-950/30"><div className="flex items-start justify-between border-b border-emerald-900/10 px-5 py-4 sm:px-7"><div><p className="text-xs font-semibold uppercase tracking-[0.28em] text-emerald-700">Green report template</p><h2 className="mt-1 text-2xl font-semibold text-emerald-950">{activeReport.title}</h2><p className="mt-1 text-sm text-emerald-900/60">Filter the data, then preview it before downloading.</p></div><button type="button" onClick={() => setActiveReport(null)} className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-emerald-900/10 bg-white text-emerald-900/60" aria-label="Close report modal"><X className="h-4 w-4" /></button></div><div className="overflow-auto p-5 sm:p-7"><div className="grid gap-3 rounded-2xl border border-emerald-900/10 bg-emerald-50/60 p-4 sm:grid-cols-3"><label className="grid gap-1.5 text-xs font-semibold uppercase tracking-wide text-emerald-900/65">Month <button type="button" onClick={() => setMonth('')} className={`ml-2 rounded-md px-2 py-1 text-[10px] font-semibold uppercase tracking-wide ${month ? 'bg-white text-emerald-700' : 'bg-emerald-800 text-white'}`}>All time</button><div className="flex items-center gap-2 rounded-xl border border-emerald-900/10 bg-white px-3 py-2.5"><Calendar className="h-4 w-4 text-emerald-700/60" /><input type="month" value={month} onChange={(event) => setMonth(event.target.value)} className="w-full bg-transparent text-sm font-normal normal-case tracking-normal text-emerald-950 outline-none" /></div></label>{activeReport.key === 'sales_trend' ? <label className="grid gap-1.5 text-xs font-semibold uppercase tracking-wide text-emerald-900/65">Category<select value={category} onChange={(event) => setCategory(event.target.value)} className="rounded-xl border border-emerald-900/10 bg-white px-3 py-2.5 text-sm font-normal normal-case tracking-normal text-emerald-950 outline-none">{categories.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label> : <label className="grid gap-1.5 text-xs font-semibold uppercase tracking-wide text-emerald-900/65">Forecast horizon<select value={horizon} onChange={(event) => setHorizon(Number(event.target.value))} className="rounded-xl border border-emerald-900/10 bg-white px-3 py-2.5 text-sm font-normal normal-case tracking-normal text-emerald-950 outline-none"><option value="3">Next 3 months</option><option value="6">Next 6 months</option><option value="12">Next 12 months</option></select></label>}<button type="button" onClick={() => loadPreview()} disabled={loading} className="self-end inline-flex h-[43px] items-center justify-center gap-2 rounded-xl bg-emerald-800 px-4 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:opacity-60"><Eye className="h-4 w-4" />{loading ? 'Loading...' : 'Refresh preview'}</button></div>{error && <p className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}{preview && <div className="mt-6 overflow-hidden rounded-2xl border border-emerald-900/10 bg-white"><div className="flex items-center justify-between gap-3 border-b border-emerald-900/10 bg-emerald-800 px-4 py-3 text-white"><div><p className="font-semibold">{preview.title}</p><p className="text-xs text-emerald-100">Showing first {Math.min(10, preview.totalRows)} of {preview.totalRows} rows</p></div><FileSpreadsheet className="h-5 w-5 text-lime-200" /></div><div className="max-h-[40vh] overflow-auto"><table className="min-w-full text-left text-sm"><thead><tr>{preview.columns.map((column) => <th key={column.key} className="sticky top-0 bg-emerald-50 px-4 py-3 font-semibold text-emerald-950">{column.header}</th>)}</tr></thead><tbody>{preview.rows.slice(0, 10).map((row, index) => <tr key={index} className="border-t border-emerald-900/10 even:bg-emerald-50/40">{preview.columns.map((column) => <td key={column.key} className="whitespace-nowrap px-4 py-3 text-emerald-900/75">{row[column.key] ?? '-'}</td>)}</tr>)}</tbody></table></div></div>}</div><div className="flex flex-col gap-3 border-t border-emerald-900/10 px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-7"><p className="text-xs text-emerald-900/55">Exports use the filters and preview currently shown.</p><div className="flex flex-wrap gap-2"><button type="button" onClick={() => exportReport('pdf')} disabled={!preview || exporting} className="inline-flex items-center gap-2 rounded-xl border border-emerald-900/10 bg-white px-4 py-2.5 text-sm font-semibold text-emerald-800 disabled:opacity-40"><Download className="h-4 w-4" />PDF</button><button type="button" onClick={() => exportReport('csv')} disabled={!preview || exporting} className="inline-flex items-center gap-2 rounded-xl border border-emerald-900/10 bg-white px-4 py-2.5 text-sm font-semibold text-emerald-800 disabled:opacity-40"><Download className="h-4 w-4" />CSV</button><button type="button" onClick={() => exportReport('xlsx')} disabled={!preview || exporting} className="inline-flex items-center gap-2 rounded-xl bg-emerald-800 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-40"><Download className="h-4 w-4" />Excel</button></div></div></div></div>}
    </section>
  );
}
