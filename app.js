// Global State
let rawData = [];
let filteredData = [];
let charts = {};

const GOOGLE_SHEET_URL = 'https://docs.google.com/spreadsheets/d/1Yaf-aMKXxZIrkFCI9RgN6cMNJaaW1PZ0e8up4Dv8Yx8/export?format=csv&gid=623910036';

// Filter State
const filters = {
    month: new Set(),
    region: new Set(),
    province: new Set(),
    district: new Set(),
    hubType: new Set(),
    hub: new Set(),
    clientType: new Set(),
    flow: new Set(),
    volumeSegment: new Set()
};

// Initialize Application
document.addEventListener('DOMContentLoaded', () => {
    loadData();
    setupEventListeners();
});

// Robust decimal and float parser
function parseSafeFloat(val) {
    if (val === null || val === undefined) return 0;
    if (typeof val === 'number') return val;
    let str = String(val).trim();
    if (str === '' || str.toLowerCase() === 'nan' || str.toLowerCase() === 'null' || str === '-') return 0;
    
    // Check for percentages
    if (str.endsWith('%')) {
        return parseSafeFloat(str.slice(0, -1)) / 100;
    }
    
    // Standard Vietnamese/German float format check: comma is decimal separator (e.g. 12,5)
    // or standard English (comma thousands, dot decimal)
    if (str.includes(',') && !str.includes('.')) {
        str = str.replace(',', '.');
    } else if (str.includes('.') && str.includes(',')) {
        if (str.indexOf(',') < str.indexOf('.')) {
            str = str.replace(/,/g, ''); // e.g. 1,234.56
        } else {
            str = str.replace(/\./g, '').replace(',', '.'); // e.g. 1.234,56
        }
    } else if (str.includes(',')) {
        const parts = str.split(',');
        if (parts[parts.length - 1].length === 3) {
            str = str.replace(/,/g, '');
        } else {
            str = str.replace(',', '.');
        }
    }
    
    const num = parseFloat(str);
    return isNaN(num) ? 0 : num;
}

// Load and Parse CSV Data
function loadData() {
    console.log("Fetching live data from Google Sheets...");
    Papa.parse(GOOGLE_SHEET_URL, {
        download: true,
        header: true,
        dynamicTyping: true,
        complete: function(results) {
            console.log("Loaded data from Google Sheets successfully.");
            
            // Validate parsed rows to detect Google Sheets private/login HTML redirection
            const firstRow = results.data ? results.data[0] : null;
            let isValid = false;
            if (firstRow) {
                const keys = Object.keys(firstRow).map(k => k.toLowerCase().replace(/[^a-z0-9]/g, ''));
                isValid = keys.some(k => k.includes('warehouseid') || k.includes('tenkh') || k.includes('thang'));
            }
            
            if (isValid) {
                processLoadedData(results.data);
            } else {
                console.warn("Google Sheet parsed but does not contain valid columns. Falling back to local data.csv.");
                loadLocalFallback();
            }
        },
        error: function(err) {
            console.warn("Could not load from Google Sheets URL. Falling back to local data.csv.", err);
            loadLocalFallback();
        }
    });
}

function loadLocalFallback() {
    console.log("Loading local fallback...");
    Papa.parse('data.csv', {
        download: true,
        header: true,
        dynamicTyping: true,
        complete: function(results) {
            console.log("Loaded data from local data.csv successfully.");
            processLoadedData(results.data);
        },
        error: function(localErr) {
            console.error("Local data fallback failed:", localErr);
            alert("Không thể tải dữ liệu từ Google Sheets hoặc local data.csv.");
        }
    });
}

function processLoadedData(parsedRows) {
    console.log("=== GHN CSV Loading Debug ===");
    console.log("Total raw lines parsed:", parsedRows ? parsedRows.length : 0);
    
    if (!parsedRows || parsedRows.length === 0) {
        console.error("Parsed rows is empty!");
        alert("Không tìm thấy dữ liệu phù hợp.");
        return;
    }

    // Inspect columns of first row
    console.log("First row raw keys:", Object.keys(parsedRows[0]));

    // Clean keys of BOMs and whitespace
    const cleanRows = parsedRows.map(row => {
        if (!row) return null;
        const cleanRow = {};
        Object.keys(row).forEach(key => {
            if (key) {
                const cleanKey = key.replace(/^\ufeff/, '').trim();
                cleanRow[cleanKey] = row[key];
            }
        });
        return cleanRow;
    }).filter(row => row !== null);

    console.log("Cleaned rows count:", cleanRows.length);
    if (cleanRows.length > 0) {
        console.log("Cleaned keys of first row:", Object.keys(cleanRows[0]));
    }

    // Filter valid rows: check if there's any key indicating a non-empty row.
    rawData = cleanRows.filter(row => {
        const whId = row.warehouse_id !== null && row.warehouse_id !== undefined && String(row.warehouse_id).trim() !== '';
        const whName = row.warehouse_name !== null && row.warehouse_name !== undefined && String(row.warehouse_name).trim() !== '';
        const shop = row.ten_kh !== null && row.ten_kh !== undefined && String(row.ten_kh).trim() !== '';
        return whId || whName || shop;
    }).map(row => {
        const volTbNgay = parseSafeFloat(row.vol_tb_ngay);
        let nhomSanLuong = '';
        
        if (volTbNgay < 100) {
            nhomSanLuong = '1. Duoi 100 don/ngay';
        } else if (volTbNgay <= 300) {
            nhomSanLuong = '2. 100 - 300 don/ngay';
        } else if (volTbNgay <= 500) {
            nhomSanLuong = '3. 300 - 500 don/ngay';
        } else if (volTbNgay <= 1000) {
            nhomSanLuong = '4. 500 - 1000 don/ngay';
        } else {
            nhomSanLuong = '5. Trên 1000 don/ngay';
        }

        const hubName = row.warehouse_name || '';
        const hubType = hubName.toLowerCase().includes('key account') ? 'KHL' : 'Bưu Cục';

        // Routing Flow Categorization: Luồng 2 (Đi thẳng KTC đầu giao) if pct_top_tinh_giao > 30%
        const flowType = (parseSafeFloat(row.pct_top_tinh_giao) > 0.30) ? '2' : '1';

        // Destination hub is KTC column, falling back to top_tinh_giao
        const ktcDest = row.KTC || row.top_tinh_giao || 'Không rõ';

        // Compatibility mapping
        const klParsed = parseSafeFloat(row.kl !== undefined ? row.kl : row['kl(kg)']);
        const soNgayParsed = parseSafeFloat(row.so_ngay !== undefined ? row.so_ngay : row.so_ngay_phat_sinh_don);
        const soNgay1000Parsed = parseSafeFloat(row.so_ngay_tren_1000 !== undefined ? row.so_ngay_tren_1000 : row.so_ngay_tren_1000_don);
        const klTbNgayParsed = parseSafeFloat(row.kl_tb_ngay !== undefined ? row.kl_tb_ngay : row['kl_tb_ngay(kg)']);
        const pctDuoi5kgParsed = parseSafeFloat(row.pct_duoi_5kg !== undefined ? row.pct_duoi_5kg : row.pct_don_duoi_5kg);
        const pctNoiVungParsed = parseSafeFloat(row.pct_noi_vung !== undefined ? row.pct_noi_vung : row.pct_don_noi_vung);
        const pctLienVungParsed = parseSafeFloat(row.pct_lien_vung !== undefined ? row.pct_lien_vung : row.pct_don_lien_vung);

        return {
            ...row,
            nhom_san_luong: nhomSanLuong,
            hub_type: hubType,
            flow_type: flowType,
            vol: parseSafeFloat(row.vol),
            kl: klParsed,
            'kl(kg)': klParsed,
            so_ngay: soNgayParsed,
            so_ngay_phat_sinh_don: soNgayParsed,
            so_ngay_tren_1000: soNgay1000Parsed,
            so_ngay_tren_1000_don: soNgay1000Parsed,
            kl_tb_ngay: klTbNgayParsed,
            'kl_tb_ngay(kg)': klTbNgayParsed,
            pct_duoi_5kg: pctDuoi5kgParsed,
            pct_don_duoi_5kg: pctDuoi5kgParsed,
            pct_noi_vung: pctNoiVungParsed,
            pct_don_noi_vung: pctNoiVungParsed,
            pct_lien_vung: pctLienVungParsed,
            pct_don_lien_vung: pctLienVungParsed,
            pct_opr: parseSafeFloat(row.pct_opr),
            pct_gio_0_9: parseSafeFloat(row.pct_gio_0_9),
            pct_gio_9_19: parseSafeFloat(row.pct_gio_9_19),
            pct_gio_19p: parseSafeFloat(row.pct_gio_19p),
            pct_rot_lc: parseSafeFloat(row.pct_rot_lc),
            pct_odr: parseSafeFloat(row.pct_odr),
            pct_longtail: parseSafeFloat(row.pct_longtail),
            KTC: ktcDest,
            top_tinh_giao: row.top_tinh_giao || row.KTC || 'Không rõ',
            pct_top_tinh_giao: parseSafeFloat(row.pct_top_tinh_giao),
            kl_tb_ngay_top_tinh_giao: parseSafeFloat(row.kl_tb_ngay_top_tinh_giao),
            vol_tb_ngay_top_tinh_giao: parseSafeFloat(row.vol_tb_ngay_top_tinh_giao),
            loai_kh: row.loai_kh || 'Chưa phân loại',
            
            // Normalized properties to avoid key mismatch
            thang: row.thang ? String(row.thang).trim() : '',
            vung: row.vung ? String(row.vung).trim() : '',
            tinh: row.tinh ? String(row.tinh).trim() : '',
            quan: row.quan ? String(row.quan).trim() : '',
            warehouse_id: row.warehouse_id ? String(row.warehouse_id).trim() : '',
            warehouse_name: row.warehouse_name ? String(row.warehouse_name).trim() : '',
            client_id: row.client_id ? String(row.client_id).trim() : '',
            shop_id: row.shop_id ? String(row.shop_id).trim() : '',
            ten_kh: row.ten_kh ? String(row.ten_kh).trim() : '',
            order_code_mau: row.order_code_mau ? String(row.order_code_mau).trim() : '',
            
            // For older script templates compatibility
            vol_tb_ngay: volTbNgay
        };
    });

    console.log("Total rawData rows mapped successfully:", rawData.length);
    filteredData = [...rawData];
    
    initializeFilters();
    updateDashboard();
}

function initializeFilters() {
    populateCheckboxes('filter-month', [...new Set(rawData.map(d => d.thang).filter(Boolean))].sort());
    populateCheckboxes('filter-region', [...new Set(rawData.map(d => d.vung).filter(Boolean))].sort());
    populateCheckboxes('filter-province', [...new Set(rawData.map(d => d.tinh).filter(Boolean))].sort());
    populateCheckboxes('filter-district', [...new Set(rawData.map(d => d.quan).filter(Boolean))].sort());
    populateCheckboxes('filter-hub-type', ['KHL', 'Bưu Cục']);
    populateCheckboxes('filter-hub', [...new Set(rawData.map(d => d.warehouse_name).filter(Boolean))].sort());
    populateCheckboxes('filter-client-type', [...new Set(rawData.map(d => d.loai_kh).filter(Boolean))].sort());
    populateCheckboxes('filter-volume-segment', [...new Set(rawData.map(d => d.nhom_san_luong).filter(Boolean))].sort());
}

function populateCheckboxes(elementId, options) {
    const container = document.getElementById(elementId);
    if (!container) return;
    container.innerHTML = '';
    options.forEach(opt => {
        const label = document.createElement('label');
        label.className = 'checkbox-item';
        
        const input = document.createElement('input');
        input.type = 'checkbox';
        input.value = opt;
        
        const span = document.createElement('span');
        span.textContent = opt;
        
        label.appendChild(input);
        label.appendChild(span);
        container.appendChild(label);
    });
}

// Event Listeners for Filters
function setupEventListeners() {
    const selectIds = [
        { id: 'filter-month', prop: 'month' },
        { id: 'filter-region', prop: 'region' },
        { id: 'filter-province', prop: 'province' },
        { id: 'filter-district', prop: 'district' },
        { id: 'filter-hub-type', prop: 'hubType' },
        { id: 'filter-hub', prop: 'hub' },
        { id: 'filter-client-type', prop: 'clientType' },
        { id: 'filter-flow', prop: 'flow' },
        { id: 'filter-volume-segment', prop: 'volumeSegment' }
    ];

    selectIds.forEach(({ id, prop }) => {
        const container = document.getElementById(id);
        container.addEventListener('change', () => {
            const checkedInputs = container.querySelectorAll('input[type="checkbox"]:checked');
            filters[prop] = new Set(Array.from(checkedInputs).map(cb => cb.value));
            applyFilters();
        });
    });

    document.getElementById('reset-filters').addEventListener('click', () => {
        document.querySelectorAll('.checkbox-item input[type="checkbox"]').forEach(cb => {
            cb.checked = false;
        });
        selectIds.forEach(({ prop }) => {
            filters[prop].clear();
        });
        const shopSearchInput = document.getElementById('detail-shop-search');
        if (shopSearchInput) {
            shopSearchInput.value = '';
        }
        // Reset grouping interactive selectors
        const groupWeightSlider = document.getElementById('grouping-min-weight');
        if (groupWeightSlider) {
            groupWeightSlider.value = 100;
            const weightLabel = document.getElementById('grouping-weight-val');
            if (weightLabel) weightLabel.textContent = '100 kg';
        }
        const groupSizeSelect = document.getElementById('grouping-size');
        if (groupSizeSelect) groupSizeSelect.value = 'all';

        const groupTruckSelect = document.getElementById('grouping-truck-type');
        if (groupTruckSelect) groupTruckSelect.value = 'all';

        const groupFlowSelect = document.getElementById('grouping-flow');
        if (groupFlowSelect) groupFlowSelect.value = 'all';
        
        const groupSearchInput = document.getElementById('grouping-search');
        if (groupSearchInput) groupSearchInput.value = '';

        applyFilters();
    });

    // Filter Search
    document.querySelectorAll('.slicer-search').forEach(input => {
        input.addEventListener('keyup', (e) => {
            const term = e.target.value.toLowerCase();
            const targetId = e.target.dataset.target;
            const container = document.getElementById(targetId);
            container.querySelectorAll('.checkbox-item').forEach(label => {
                const text = label.textContent.toLowerCase();
                if (text.includes(term)) {
                    label.style.display = 'flex';
                } else {
                    label.style.display = 'none';
                }
            });
        });
    });

    // Trend Shop Select
    document.getElementById('trend-shop-select').addEventListener('change', renderShopTrendChart);

    // Focus Shop Chart Toggle
    const focusToggleContainer = document.getElementById('focus-chart-toggle');
    if (focusToggleContainer) {
        focusToggleContainer.addEventListener('click', (e) => {
            const btn = e.target.closest('.btn-toggle');
            if (!btn) return;
            focusToggleContainer.querySelectorAll('.btn-toggle').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            renderFocusShopsChart();
        });
    }

    // Detail Shop Search Slicer
    const detailShopSearch = document.getElementById('detail-shop-search');
    if (detailShopSearch) {
        detailShopSearch.addEventListener('input', updateTable);
    }

    // Grouping Slicers listeners

    const groupWeightSlider = document.getElementById('grouping-min-weight');
    if (groupWeightSlider) {
        groupWeightSlider.addEventListener('input', (e) => {
            const label = document.getElementById('grouping-weight-val');
            if (label) label.textContent = `${e.target.value} kg`;
            updateGroupingTab();
        });
    }

    document.getElementById('grouping-size')?.addEventListener('change', updateGroupingTab);
    document.getElementById('grouping-truck-type')?.addEventListener('change', updateGroupingTab);
    document.getElementById('grouping-flow')?.addEventListener('change', updateGroupingTab);
    document.getElementById('grouping-search')?.addEventListener('input', updateGroupingTab);

    // Tab Navigation
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
            document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
            
            btn.classList.add('active');
            document.getElementById(btn.dataset.tab).classList.add('active');
        });
    });
}

// Apply Filters to Data
function applyFilters() {
    filteredData = rawData.filter(row => {
        const matchMonth = filters.month.size === 0 || filters.month.has(row.thang);
        const matchRegion = filters.region.size === 0 || filters.region.has(row.vung);
        const matchProvince = filters.province.size === 0 || filters.province.has(row.tinh);
        const matchDistrict = filters.district.size === 0 || filters.district.has(row.quan);
        const matchHubType = filters.hubType.size === 0 || filters.hubType.has(row.hub_type);
        const matchHub = filters.hub.size === 0 || filters.hub.has(row.warehouse_name);
        
        // New filters
        const matchClient = filters.clientType.size === 0 || filters.clientType.has(row.loai_kh);
        const matchFlow = filters.flow.size === 0 || filters.flow.has(row.flow_type);
        const matchVolumeSegment = filters.volumeSegment.size === 0 || filters.volumeSegment.has(row.nhom_san_luong);

        return matchMonth && matchRegion && matchProvince && matchDistrict && 
               matchHubType && matchHub && matchClient && matchFlow && matchVolumeSegment;
    });

    updateDashboard();
}

// Update Entire Dashboard
function updateDashboard() {
    try {
        updateScorecards();
    } catch (e) {
        console.error("Error in updateScorecards:", e);
    }
    
    try {
        renderCharts();
    } catch (e) {
        console.error("Error in renderCharts:", e);
    }
    
    try {
        updateTable();
    } catch (e) {
        console.error("Error in updateTable:", e);
    }
    
    try {
        generateAlerts();
    } catch (e) {
        console.error("Error in generateAlerts:", e);
    }
    
    try {
        renderHeatmaps();
    } catch (e) {
        console.error("Error in renderHeatmaps:", e);
    }
    
    try {
        updateTrendShopOptions();
    } catch (e) {
        console.error("Error in updateTrendShopOptions:", e);
    }
    
    try {
        updateGroupingTab();
    } catch (e) {
        console.error("Error in updateGroupingTab:", e);
    }
    
    try {
        updateVolumeBreakdown();
    } catch (e) {
        console.error("Error in updateVolumeBreakdown:", e);
    }
}

// Formatter Helpers
const formatNumber = (num) => {
    if (num === null || num === undefined || isNaN(num)) return '-';
    return new Intl.NumberFormat('vi-VN').format(Math.round(num));
};
const formatPercent = (num) => {
    if (num === null || num === undefined || isNaN(num)) return '-';
    return (num * 100).toFixed(2) + '%';
};
const formatFloat = (num, decimals = 2) => {
    if (num === null || num === undefined || isNaN(num)) return '-';
    return new Intl.NumberFormat('vi-VN', {
        minimumFractionDigits: 0,
        maximumFractionDigits: decimals
    }).format(num);
};

// Update Scorecards
function updateScorecards() {
    const totalVol = filteredData.reduce((sum, row) => sum + row.vol, 0);
    const totalWeight = filteredData.reduce((sum, row) => sum + row['kl(kg)'], 0);
    
    // Weighted Average OPR & % Rớt Luân Chuyển
    let totalOprVol = 0;
    let totalRotLcVol = 0;
    filteredData.forEach(row => {
        totalOprVol += (row.pct_opr * row.vol);
        totalRotLcVol += ((row.pct_rot_lc || 0) * row.vol);
    });
    const avgOpr = totalVol > 0 ? (totalOprVol / totalVol) : 0;
    const avgRotLc = totalVol > 0 ? (totalRotLcVol / totalVol) : 0;
    
    // Weighted Average ODR & Longtail (weighted by vol)
    let totalOdrVol = 0;
    let totalLongtailVol = 0;
    filteredData.forEach(row => {
        totalOdrVol += ((row.pct_odr || 0) * row.vol);
        totalLongtailVol += ((row.pct_longtail || 0) * row.vol);
    });
    const avgOdr = totalVol > 0 ? (totalOdrVol / totalVol) : 0;
    const avgLongtail = totalVol > 0 ? (totalLongtailVol / totalVol) : 0;
    
    const totalShops = filteredData.length;

    const elVol = document.getElementById('score-volume');
    if (elVol) elVol.textContent = formatNumber(totalVol);

    const elWeight = document.getElementById('score-weight');
    if (elWeight) elWeight.textContent = formatNumber(totalWeight);

    const elOpr = document.getElementById('score-opr');
    if (elOpr) elOpr.textContent = formatPercent(avgOpr);

    const elShops = document.getElementById('score-shops');
    if (elShops) elShops.textContent = formatNumber(totalShops);
    
    const scoreTransferDrop = document.getElementById('score-transfer-drop');
    if (scoreTransferDrop) {
        scoreTransferDrop.textContent = formatPercent(avgRotLc);
    }

    const elOdr = document.getElementById('score-odr');
    if (elOdr) elOdr.textContent = formatPercent(avgOdr);

    const elLongtail = document.getElementById('score-longtail');
    if (elLongtail) elLongtail.textContent = formatPercent(avgLongtail);
}

// Chart Configurations
Chart.register(ChartDataLabels);
Chart.defaults.set('plugins.datalabels', {
    display: false // Disable by default on all charts
});
Chart.defaults.color = '#94a3b8';
Chart.defaults.font.family = 'Inter';

function renderCharts() {
    renderFocusShopsChart();
}

function renderFocusShopsChart() {
    const ctx = document.getElementById('chart-focus-shops').getContext('2d');

    // Filter focus shops with a volume of >= 5 and at least one underperforming index
    let focusShops = filteredData.filter(d => 
        d.vol_tb_ngay >= 5 && (
            (d.pct_opr > 0 && d.pct_opr < 0.9) || 
            (d.pct_rot_lc > 0.02) || 
            (d.pct_odr > 0 && d.pct_odr < 0.92) || 
            (d.pct_longtail > 0.08)
        )
    );

    // Sort by combined Risk Index (Volume * combined failures)
    focusShops.sort((a, b) => {
        const riskA = a.vol_tb_ngay * ((1 - a.pct_opr) + (a.pct_rot_lc || 0) + 1.5 * (1 - a.pct_odr) + 1.5 * (a.pct_longtail || 0));
        const riskB = b.vol_tb_ngay * ((1 - b.pct_opr) + (b.pct_rot_lc || 0) + 1.5 * (1 - b.pct_odr) + 1.5 * (b.pct_longtail || 0));
        return riskB - riskA;
    });
    
    focusShops = focusShops.slice(0, 20);

    // Hiển thị full tên shop (không cắt)
    const labels = focusShops.map(s => s.ten_kh || s.warehouse_name || 'Unknown');
    const volData = focusShops.map(s => s.vol_tb_ngay);

    // Check toggle state (sla vs ops)
    const activeBtn = document.querySelector('#focus-chart-toggle .btn-toggle.active');
    const metricMode = activeBtn ? activeBtn.dataset.metric : 'sla';

    let line1Label = '';
    let line1Data = [];
    let line1Color = '';
    let line1Align = 'bottom';
    
    let line2Label = '';
    let line2Data = [];
    let line2Color = '';
    let line2Align = 'top';

    if (metricMode === 'sla') {
        line1Label = 'ODR (%)';
        line1Data = focusShops.map(s => (s.pct_odr || 0) * 100);
        line1Color = 'rgba(20, 184, 166, 1)'; // Teal

        line2Label = '% Longtail (%)';
        line2Data = focusShops.map(s => (s.pct_longtail || 0) * 100);
        line2Color = 'rgba(249, 115, 22, 1)'; // Orange
    } else {
        line1Label = 'OPR (%)';
        line1Data = focusShops.map(s => s.pct_opr * 100);
        line1Color = 'rgba(168, 85, 247, 1)'; // Purple

        line2Label = '% Rớt LC (%)';
        line2Data = focusShops.map(s => (s.pct_rot_lc || 0) * 100);
        line2Color = 'rgba(239, 68, 68, 1)'; // Red
    }

    if (charts.focusShops) charts.focusShops.destroy();

    charts.focusShops = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [
                {
                    type: 'line',
                    label: line1Label,
                    data: line1Data,
                    borderColor: line1Color,
                    backgroundColor: line1Color,
                    borderWidth: 2,
                    yAxisID: 'y1',
                    tension: 0.3,
                    pointRadius: 4,
                    order: 1,
                    datalabels: {
                        display: true,
                        color: line1Color,
                        align: line1Align,
                        font: { weight: 'bold', size: 10 },
                        formatter: function(value) { return value.toFixed(1) + '%'; }
                    }
                },
                {
                    type: 'line',
                    label: line2Label,
                    data: line2Data,
                    borderColor: line2Color,
                    backgroundColor: line2Color,
                    borderWidth: 2,
                    yAxisID: 'y1',
                    tension: 0.3,
                    pointRadius: 4,
                    order: 2,
                    datalabels: {
                        display: true,
                        color: line2Color,
                        align: line2Align,
                        font: { weight: 'bold', size: 10 },
                        formatter: function(value) { return value.toFixed(1) + '%'; }
                    }
                },
                {
                    type: 'bar',
                    label: 'Sản Lượng (Đơn/Ngày)',
                    data: volData,
                    backgroundColor: 'rgba(56, 189, 248, 0.7)',
                    borderRadius: 4,
                    yAxisID: 'y',
                    order: 3,
                    datalabels: {
                        display: true,
                        color: 'rgba(241, 245, 249, 1)',
                        anchor: 'end',
                        align: 'start',
                        font: { weight: 'bold', size: 10 },
                        formatter: Math.round
                    }
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                x: { grid: { color: 'rgba(51, 65, 85, 0.5)' } },
                y: {
                    type: 'linear',
                    display: true,
                    position: 'left',
                    title: { display: true, text: 'Sản Lượng', color: 'rgba(148, 163, 184, 1)' },
                    grid: { color: 'rgba(51, 65, 85, 0.5)' }
                },
                y1: {
                    type: 'linear',
                    display: true,
                    position: 'right',
                    title: { display: true, text: 'Tỷ lệ (%)', color: 'rgba(148, 163, 184, 1)' },
                    min: 0,
                    max: 100,
                    grid: { drawOnChartArea: false }
                }
            },
            plugins: {
                legend: { labels: { color: 'rgba(241, 245, 249, 1)' } },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            let label = context.dataset.label || '';
                            if (label) label += ': ';
                            if (context.datasetIndex === 0 || context.datasetIndex === 1) {
                                label += context.raw.toFixed(1) + '%';
                            } else {
                                label += Math.round(context.raw).toLocaleString();
                            }
                            return label;
                        },
                        afterBody: function(context) {
                            const shopIdx = context[0].dataIndex;
                            const shop = focusShops[shopIdx];
                            const shopName = shop.ten_kh;
                            const hubName  = shop.warehouse_name;

                            const history = rawData
                                .filter(r => r.ten_kh === shopName && r.warehouse_name === hubName)
                                .sort((a, b) => (a.thang || '').localeCompare(b.thang || ''));

                            let lines = [
                                `${hubName || 'Không rõ'}`,
                                `KL TB: ${Math.round(shop['kl_tb_ngay(kg)'] || 0).toLocaleString()} Kg/Ngày`,
                                `Số ngày >1000 đơn: ${shop.so_ngay_tren_1000_don || 0} ngày`,
                                `SLA: ODR ${(shop.pct_odr * 100).toFixed(1)}% | Longtail ${(shop.pct_longtail * 100).toFixed(1)}%`,
                                `Vận Hành: OPR ${(shop.pct_opr * 100).toFixed(1)}% | Rớt LC ${((shop.pct_rot_lc || 0) * 100).toFixed(1)}%`,
                                '─── Lịch Sử 3 Tháng ───'
                            ];
                            history.forEach(h => {
                                const odrPct = ((h.pct_odr || 0) * 100).toFixed(1);
                                const longtailPct = ((h.pct_longtail || 0) * 100).toFixed(1);
                                const rotLcPct = ((h.pct_rot_lc || 0) * 100).toFixed(1);
                                const oprPct   = (h.pct_opr * 100).toFixed(1);
                                const vol      = Math.round(h.vol_tb_ngay || 0);
                                lines.push("T" + (h.thang || '?') + ": " + vol + " đơn | ODR " + odrPct + "% | Longtail " + longtailPct + "% | Rớt LC " + rotLcPct + "%");
                            });
                            return lines;
                        },
                        afterLabel: function() { return null; }
                    }
                }
            }
        }
    });
}




function updateTrendShopOptions() {
    const select = document.getElementById('trend-shop-select');
    const currentVal = select.value;
    select.innerHTML = '<option value="">-- Chọn Shop --</option>';
    
    // Sort filtered shops by volume descending
    const sortedShops = [...filteredData]
        .sort((a, b) => b.vol_tb_ngay - a.vol_tb_ngay)
        .slice(0, 50); // Top 50 shops for selection
        
    const uniqueShops = new Map();
    sortedShops.forEach(s => {
        const key = `${s.ten_kh}|${s.warehouse_name}`;
        if (!uniqueShops.has(key)) {
            uniqueShops.set(key, { name: s.ten_kh, hub: s.warehouse_name });
        }
    });

    uniqueShops.forEach((data, key) => {
        const opt = document.createElement('option');
        opt.value = key;
        opt.textContent = `${data.name} (${data.hub})`;
        select.appendChild(opt);
    });

    if (uniqueShops.has(currentVal)) {
        select.value = currentVal;
    }
    
    renderShopTrendChart();
}

function renderShopTrendChart() {
    const ctx = document.getElementById('chart-shop-trend').getContext('2d');
    const selectedKey = document.getElementById('trend-shop-select').value;

    if (!selectedKey) {
        if (charts.trend) charts.trend.destroy();
        return;
    }

    const [shopName, hubName] = selectedKey.split('|');

    // Get all records for this shop AND hub across all months (respecting selected filters)
    const shopData = filteredData
        .filter(r => r.ten_kh === shopName && r.warehouse_name === hubName)
        .sort((a, b) => a.thang.localeCompare(b.thang));

    const labels = shopData.map(d => d.thang);
    const volData = shopData.map(d => d.vol_tb_ngay || 0);
    const oprData = shopData.map(d => d.pct_opr * 100);
    const rotLcData = shopData.map(d => (d.pct_rot_lc || 0) * 100);
    const odrData = shopData.map(d => (d.pct_odr || 0) * 100);
    const longtailData = shopData.map(d => (d.pct_longtail || 0) * 100);

    if (charts.trend) charts.trend.destroy();

    charts.trend = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [
                {
                    type: 'bar',
                    label: 'Sản Lượng (Đơn/Ngày)',
                    data: volData,
                    borderColor: 'rgba(59, 130, 246, 1)',
                    backgroundColor: 'rgba(59, 130, 246, 0.8)',
                    yAxisID: 'y',
                    order: 5,
                    datalabels: {
                        display: true,
                        color: 'rgba(241, 245, 249, 1)',
                        anchor: 'end',
                        align: 'start',
                        font: { weight: 'bold', size: 10 },
                        formatter: Math.round
                    }
                },
                {
                    type: 'line',
                    label: 'OPR (%)',
                    data: oprData,
                    borderColor: 'rgba(168, 85, 247, 1)',
                    backgroundColor: 'rgba(168, 85, 247, 1)',
                    borderWidth: 2,
                    tension: 0.3,
                    yAxisID: 'y1',
                    order: 1,
                    datalabels: {
                        display: true,
                        color: 'rgba(168, 85, 247, 1)',
                        align: 'bottom',
                        font: { weight: 'bold', size: 10 },
                        formatter: function(value) { return value.toFixed(1) + '%'; }
                    }
                },
                {
                    type: 'line',
                    label: '% Rớt LC (%)',
                    data: rotLcData,
                    borderColor: 'rgba(239, 68, 68, 1)',
                    backgroundColor: 'rgba(239, 68, 68, 1)',
                    borderWidth: 2,
                    tension: 0.3,
                    yAxisID: 'y1',
                    order: 2,
                    datalabels: {
                        display: true,
                        color: 'rgba(239, 68, 68, 1)',
                        align: 'top',
                        font: { weight: 'bold', size: 10 },
                        formatter: function(value) { return value.toFixed(1) + '%'; }
                    }
                },
                {
                    type: 'line',
                    label: 'ODR (%)',
                    data: odrData,
                    borderColor: 'rgba(20, 184, 166, 1)',
                    backgroundColor: 'rgba(20, 184, 166, 1)',
                    borderWidth: 2,
                    tension: 0.3,
                    yAxisID: 'y1',
                    order: 3,
                    datalabels: {
                        display: true,
                        color: 'rgba(20, 184, 166, 1)',
                        align: 'bottom',
                        font: { weight: 'bold', size: 10 },
                        formatter: function(value) { return value.toFixed(1) + '%'; }
                    }
                },
                {
                    type: 'line',
                    label: '% Longtail (%)',
                    data: longtailData,
                    borderColor: 'rgba(249, 115, 22, 1)',
                    backgroundColor: 'rgba(249, 115, 22, 1)',
                    borderWidth: 2,
                    tension: 0.3,
                    yAxisID: 'y1',
                    order: 4,
                    datalabels: {
                        display: true,
                        color: 'rgba(249, 115, 22, 1)',
                        align: 'top',
                        font: { weight: 'bold', size: 10 },
                        formatter: function(value) { return value.toFixed(1) + '%'; }
                    }
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                x: { grid: { color: 'rgba(51, 65, 85, 0.5)' } },
                y: { type: 'linear', position: 'left', title: { display: true, text: 'Sản Lượng (TB/Ngày)' }, grid: { color: 'rgba(51, 65, 85, 0.5)' } },
                y1: { type: 'linear', position: 'right', title: { display: true, text: 'Tỷ lệ (%)' }, grid: { drawOnChartArea: false }, min: 0, max: 100 }
            },
            plugins: { 
                legend: { position: 'top' },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            let label = context.dataset.label || '';
                            if (label) {
                                label += ': ';
                            }
                            if (context.datasetIndex >= 1 && context.datasetIndex <= 4) {
                                label += context.raw.toFixed(1) + '%';
                            } else {
                                label += Math.round(context.raw).toLocaleString();
                            }
                            return label;
                        },
                        afterLabel: function(context) {
                            const row = shopData[context.dataIndex];
                            return [
                                `Khối lượng TB: ${Math.round(row['kl_tb_ngay(kg)'] || 0).toLocaleString()} Kg/Ngày`,
                                `Số ngày >1000 đơn: ${row.so_ngay_tren_1000_don || 0} ngày`
                            ];
                        }
                    }
                }
            }
        }
    });
}





// Update Detailed Data Table
function updateTable() {
    const tbody = document.querySelector('#details-table tbody');
    if (!tbody) return;
    tbody.innerHTML = '';

    const shopSearchVal = (document.getElementById('detail-shop-search')?.value || '').trim().toLowerCase();

    // Filter by Shop Name if query is present
    let tableData = [...filteredData];
    if (shopSearchVal) {
        tableData = tableData.filter(row => (row.ten_kh || '').toLowerCase().includes(shopSearchVal));
    }

    // Sort by Volume descending by default, take top 500
    tableData = tableData
        .sort((a, b) => b.vol - a.vol)
        .slice(0, 500);

    const maxVol = tableData.length > 0 ? Math.max(...tableData.map(d => d.vol)) : 0;

    tableData.forEach(row => {
        const tr = document.createElement('tr');
        
        // Highlight low OPR, low ODR, or high Longtail in red
        if (row.pct_opr < 0.9 || row.pct_odr < 0.92 || row.pct_longtail > 0.08) {
            tr.className = 'danger-row';
        }

        const volIntensity = maxVol > 0 ? (row.vol / maxVol) : 0;
        const volBg = `rgba(59, 130, 246, ${Math.max(0.1, volIntensity)})`;
        
        let oprBg = '';
        if (row.pct_opr < 0.85) oprBg = '#ef4444';
        else if (row.pct_opr < 0.90) oprBg = '#f97316';
        else if (row.pct_opr < 0.95) oprBg = '#eab308';
        else oprBg = '#22c55e';

        let rotLcBg = '';
        const rotLc = row.pct_rot_lc || 0;
        if (rotLc <= 0.02) rotLcBg = '#22c55e'; // Green (Good)
        else if (rotLc <= 0.05) rotLcBg = '#eab308'; // Yellow (Warning)
        else if (rotLc <= 0.10) rotLcBg = '#f97316'; // Orange (High Risk)
        else rotLcBg = '#ef4444'; // Red (Critical)

        let odrBg = '';
        if (row.pct_odr < 0.85) odrBg = '#ef4444';
        else if (row.pct_odr < 0.90) odrBg = '#f97316';
        else if (row.pct_odr < 0.95) odrBg = '#eab308';
        else odrBg = '#22c55e';

        let longtailBg = '';
        const longtail = row.pct_longtail || 0;
        if (longtail <= 0.05) longtailBg = '#22c55e';
        else if (longtail <= 0.10) longtailBg = '#eab308';
        else if (longtail <= 0.15) longtailBg = '#f97316';
        else longtailBg = '#ef4444';

        tr.innerHTML = `
            <td>${row.thang || '-'}</td>
            <td>${row.vung || '-'}</td>
            <td>${row.tinh || '-'}</td>
            <td>${row.quan || '-'}</td>
            <td>${row.warehouse_id || '-'}</td>
            <td><strong>${row.warehouse_name || '-'}</strong></td>
            <td style="font-family: monospace; color: var(--text-muted); font-size: 0.85rem;">${row.client_id || '-'}</td>
            <td style="font-family: monospace; color: var(--text-muted); font-size: 0.85rem;">${row.shop_id || '-'}</td>
            <td style="color: var(--accent-blue); font-weight: bold;">${row.ten_kh || '-'}</td>
            <td><span class="badge" style="background-color: rgba(59, 130, 246, 0.15); color: #60a5fa;">${row.loai_kh || '-'}</span></td>
            <td style="background-color: ${volBg}; font-weight: bold;">${formatNumber(row.vol)}</td>
            <td>${formatFloat(row.kl, 2)}</td>
            <td>${formatNumber(row.so_ngay)}</td>
            <td>${formatNumber(row.so_ngay_tren_1000)}</td>
            <td>${formatFloat(row.vol_tb_ngay, 1)}</td>
            <td>${formatFloat(row.kl_tb_ngay, 2)}</td>
            <td>${formatPercent(row.pct_duoi_5kg || 0)}</td>
            <td>${formatPercent(row.pct_noi_vung || 0)}</td>
            <td>${formatPercent(row.pct_lien_vung || 0)}</td>
            <td>${formatPercent(row.pct_gio_0_9 || 0)}</td>
            <td>${formatPercent(row.pct_gio_9_19 || 0)}</td>
            <td>${formatPercent(row.pct_gio_19p || 0)}</td>
            <td style="background-color: ${oprBg}; color: white; font-weight: bold">${formatPercent(row.pct_opr)}</td>
            <td style="background-color: ${rotLcBg}; color: white; font-weight: bold">${formatPercent(row.pct_rot_lc || 0)}</td>
            <td style="background-color: ${odrBg}; color: white; font-weight: bold">${formatPercent(row.pct_odr || 0)}</td>
            <td style="background-color: ${longtailBg}; color: white; font-weight: bold">${formatPercent(row.pct_longtail || 0)}</td>
            <td style="font-weight: 600; color: var(--text-main);">${row.top_tinh_giao || '-'}</td>
            <td style="font-weight: 600; color: var(--accent-teal);">${formatPercent(row.pct_top_tinh_giao || 0)}</td>
            <td style="font-weight: 600; color: var(--accent-teal);">${formatFloat(row.kl_tb_ngay_top_tinh_giao || 0, 2)}</td>
            <td style="font-weight: 600; color: var(--accent-blue);">${formatFloat(row.vol_tb_ngay_top_tinh_giao || 0, 1)}</td>
            <td style="font-family: monospace; color: var(--text-muted); font-size: 0.85rem; font-weight: 500;">${row.order_code_mau || '-'}</td>
            <td style="font-weight: 600; color: var(--accent-teal);">${row.KTC || '-'}</td>
        `;
        tbody.appendChild(tr);
    });

    if (tableData.length === 0) {
        tbody.innerHTML = '<tr><td colspan="31" style="text-align: center; padding: 2rem;">Không tìm thấy dữ liệu phù hợp với bộ lọc.</td></tr>';
    }
}

// Generate Alerts
function generateAlerts() {
    // Empty function to remove alerts as requested by user
}

// Generate Heatmaps
function renderHeatmaps() {
    const container = document.getElementById('heatmap-container');
    if (!container) return;
    container.innerHTML = '';

    // Group by Region then District
    const regions = {};
    filteredData.forEach(row => {
        const r = row.vung || 'Khác';
        const d = row.quan || 'Unknown';
        if (!regions[r]) regions[r] = {};
        if (!regions[r][d]) {
            regions[r][d] = { 
                vol: 0, 
                totalOprVol: 0, 
                totalRotLcVol: 0,
                totalOdrVol: 0,
                totalLongtailVol: 0
            };
        }
        regions[r][d].vol += row.vol;
        regions[r][d].totalOprVol += (row.pct_opr * row.vol);
        regions[r][d].totalRotLcVol += ((row.pct_rot_lc || 0) * row.vol);
        regions[r][d].totalOdrVol += ((row.pct_odr || 0) * row.vol);
        regions[r][d].totalLongtailVol += ((row.pct_longtail || 0) * row.vol);
    });

    Object.keys(regions).sort().forEach(r => {
        const districtObj = regions[r];
        const districts = Object.entries(districtObj).map(([name, data]) => ({
            name,
            vol: data.vol,
            opr: data.vol > 0 ? (data.totalOprVol / data.vol) : 0,
            rotLc: data.vol > 0 ? (data.totalRotLcVol / data.vol) : 0,
            odr: data.vol > 0 ? (data.totalOdrVol / data.vol) : 0,
            longtail: data.vol > 0 ? (data.totalLongtailVol / data.vol) : 0
        })).sort((a, b) => b.vol - a.vol); // Sort by volume descending

        if (districts.length === 0) return;

        const maxVol = Math.max(...districts.map(d => d.vol));

        let html = `<div><h4 style="margin-bottom: 0.5rem; color: var(--accent-blue);">${r}</h4>`;
        html += `<table class="heatmap-table">
            <thead>
                <tr>
                    <th>Quận/Huyện</th>
                    <th style="text-align: right;">Sản Lượng</th>
                    <th style="text-align: center;">Rớt LC</th>
                    <th style="text-align: center;">OPR</th>
                    <th style="text-align: center;">ODR</th>
                    <th style="text-align: center;">Longtail</th>
                </tr>
            </thead>
            <tbody>`;

        districts.forEach(d => {
            // Volume: clean transparent blue overlay for high-contrast legibility
            const volIntensity = maxVol > 0 ? (d.vol / maxVol) : 0;
            const volBg = `rgba(59, 130, 246, ${Math.max(0.12, volIntensity * 0.5)})`;
            
            // Unified simplified color styling: soft transparent green (healthy) vs soft transparent red (warning)
            const redBg = 'rgba(239, 68, 68, 0.15)';
            const greenBg = 'rgba(34, 197, 94, 0.1)';
            const redText = '#fc8181';
            const greenText = '#4ade80';

            const rotLcBg = d.rotLc > 0.02 ? redBg : greenBg;
            const rotLcColor = d.rotLc > 0.02 ? redText : greenText;

            const oprBg = d.opr < 0.9 ? redBg : greenBg;
            const oprColor = d.opr < 0.9 ? redText : greenText;

            const odrBg = d.odr < 0.92 ? redBg : greenBg;
            const odrColor = d.odr < 0.92 ? redText : greenText;

            const longtailBg = d.longtail > 0.08 ? redBg : greenBg;
            const longtailColor = d.longtail > 0.08 ? redText : greenText;

            html += `<tr>
                <td>${d.name}</td>
                <td style="background-color: ${volBg}; text-align: right; font-weight: bold; color: white;">${formatNumber(d.vol)}</td>
                <td style="background-color: ${rotLcBg}; color: ${rotLcColor}; font-weight: bold; text-align: center;">${formatPercent(d.rotLc)}</td>
                <td style="background-color: ${oprBg}; color: ${oprColor}; font-weight: bold; text-align: center;">${formatPercent(d.opr)}</td>
                <td style="background-color: ${odrBg}; color: ${odrColor}; font-weight: bold; text-align: center;">${formatPercent(d.odr)}</td>
                <td style="background-color: ${longtailBg}; color: ${longtailColor}; font-weight: bold; text-align: center;">${formatPercent(d.longtail)}</td>
            </tr>`;
        });

        html += `</tbody></table></div>`;
        container.innerHTML += html;
    });
}


// Calculate combinations of 2 and 3 shops for each (quan, warehouse_name, KTC) cluster
function calculateShopGroups() {
    const shopsMap = {};
    
    filteredData.forEach(row => {
        const quan = row.quan;
        const whName = row.warehouse_name;
        const shop = row.ten_kh;
        
        if (!quan || !whName || !shop) return;
        const shopKey = `${quan} ||| ${whName} ||| ${shop}`;
        
        if (!shopsMap[shopKey]) {
            shopsMap[shopKey] = {
                ten_kh: shop,
                quan: quan,
                warehouse_name: whName,
                vol_sum: 0,
                vol_count: 0,
                kl_sum: 0,
                kl_count: 0,
                vol_tb_ngay_sum: 0,
                vol_tb_ngay_count: 0,
                kl_tb_ngay_sum: 0,
                kl_tb_ngay_count: 0,
                pct_top_tinh_giao_sum: 0,
                pct_top_tinh_giao_count: 0,
                kl_tb_ngay_top_tinh_giao_sum: 0,
                kl_tb_ngay_top_tinh_giao_count: 0,
                vol_tb_ngay_top_tinh_giao_sum: 0,
                vol_tb_ngay_top_tinh_giao_count: 0,
                top_tinh_giao: row.top_tinh_giao || 'Không rõ',
                loai_kh: row.loai_kh || 'Chưa phân loại',
                KTC: row.KTC || 'Không rõ',
                
                // SLA & OPR aggregations
                opr_vol_sum: 0,
                rot_lc_vol_sum: 0,
                odr_vol_sum: 0,
                longtail_vol_sum: 0,
                total_vol: 0
            };
        }
        
        const s = shopsMap[shopKey];
        s.vol_sum += parseSafeFloat(row.vol);
        s.vol_count++;
        s.kl_sum += parseSafeFloat(row.kl || row['kl(kg)']);
        s.kl_count++;
        
        s.vol_tb_ngay_sum += parseSafeFloat(row.vol_tb_ngay);
        s.vol_tb_ngay_count++;
        s.kl_tb_ngay_sum += parseSafeFloat(row.kl_tb_ngay || row['kl_tb_ngay(kg)']);
        s.kl_tb_ngay_count++;
        
        s.pct_top_tinh_giao_sum += parseSafeFloat(row.pct_top_tinh_giao);
        s.pct_top_tinh_giao_count++;
        s.kl_tb_ngay_top_tinh_giao_sum += parseSafeFloat(row.kl_tb_ngay_top_tinh_giao);
        s.kl_tb_ngay_top_tinh_giao_count++;
        s.vol_tb_ngay_top_tinh_giao_sum += parseSafeFloat(row.vol_tb_ngay_top_tinh_giao);
        s.vol_tb_ngay_top_tinh_giao_count++;
        
        const rowVol = parseSafeFloat(row.vol);
        s.total_vol += rowVol;
        s.opr_vol_sum += parseSafeFloat(row.pct_opr) * rowVol;
        s.rot_lc_vol_sum += parseSafeFloat(row.pct_rot_lc) * rowVol;
        s.odr_vol_sum += parseSafeFloat(row.pct_odr) * rowVol;
        s.longtail_vol_sum += parseSafeFloat(row.pct_longtail) * rowVol;
    });

    const shopsList = Object.values(shopsMap).map(s => {
        const avgVolTbNgay = s.vol_tb_ngay_count > 0 ? (s.vol_tb_ngay_sum / s.vol_tb_ngay_count) : 0;
        const avgKlTbNgay = s.kl_tb_ngay_count > 0 ? (s.kl_tb_ngay_sum / s.kl_tb_ngay_count) : 0;
        const avgPctTopTinhGiao = s.pct_top_tinh_giao_count > 0 ? (s.pct_top_tinh_giao_sum / s.pct_top_tinh_giao_count) : 0;
        const avgKlTopTinhGiao = s.kl_tb_ngay_top_tinh_giao_count > 0 ? (s.kl_tb_ngay_top_tinh_giao_sum / s.kl_tb_ngay_top_tinh_giao_count) : 0;
        const avgVolTopTinhGiao = s.vol_tb_ngay_top_tinh_giao_count > 0 ? (s.vol_tb_ngay_top_tinh_giao_sum / s.vol_tb_ngay_top_tinh_giao_count) : 0;
        
        const weightedOpr = s.total_vol > 0 ? (s.opr_vol_sum / s.total_vol) : 0;
        const weightedRotLc = s.total_vol > 0 ? (s.rot_lc_vol_sum / s.total_vol) : 0;
        const weightedOdr = s.total_vol > 0 ? (s.odr_vol_sum / s.total_vol) : 0;
        const weightedLongtail = s.total_vol > 0 ? (s.longtail_vol_sum / s.total_vol) : 0;

        return {
            ten_kh: s.ten_kh,
            quan: s.quan,
            warehouse_name: s.warehouse_name,
            avg_vol_tb_ngay: avgVolTbNgay,
            avg_kl_tb_ngay: avgKlTbNgay,
            pct_top_tinh_giao: avgPctTopTinhGiao,
            kl_tb_ngay_top_tinh_giao: avgKlTopTinhGiao,
            vol_tb_ngay_top_tinh_giao: avgVolTopTinhGiao,
            top_tinh_giao: s.top_tinh_giao,
            loai_kh: s.loai_kh,
            KTC: s.KTC || 'Không rõ',
            
            weighted_opr: weightedOpr,
            weighted_rot_lc: weightedRotLc,
            weighted_odr: weightedOdr,
            weighted_longtail: weightedLongtail,
            total_vol: s.total_vol
        };
    });

    // Group candidates by: quan + warehouse_name + KTC
    const clusters = {};
    shopsList.forEach(s => {
        const clusterKey = `${s.quan} ||| ${s.warehouse_name} ||| ${s.KTC}`;
        if (!clusters[clusterKey]) {
            clusters[clusterKey] = [];
        }
        clusters[clusterKey].push(s);
    });

    const allProposals = [];

    Object.entries(clusters).forEach(([clusterKey, candidateShops]) => {
        const [quan, whName, ktcDest] = clusterKey.split(' ||| ');

        // 1. Size 1 (Single shop proposals)
        candidateShops.forEach(s => {
            // Check if s qualifies for Flow 2 single
            const fitsFlow2 = s.pct_top_tinh_giao > 0.30 && s.kl_tb_ngay_top_tinh_giao >= 5000;
            
            if (fitsFlow2) {
                allProposals.push({
                    is_single: true,
                    quan,
                    warehouse_name: whName,
                    flow_type: '2',
                    KTC: ktcDest,
                    shops: [s],
                    combined_vol_tb_ngay: s.vol_tb_ngay_top_tinh_giao,
                    combined_kl_tb_ngay: s.kl_tb_ngay_top_tinh_giao,
                    combined_vol: s.total_vol,
                    combined_opr: s.weighted_opr,
                    combined_rot_lc: s.weighted_rot_lc,
                    combined_odr: s.weighted_odr,
                    combined_longtail: s.weighted_longtail
                });
            } else {
                // Fallback to Flow 1 single
                allProposals.push({
                    is_single: true,
                    quan,
                    warehouse_name: whName,
                    flow_type: '1',
                    KTC: ktcDest,
                    shops: [s],
                    combined_vol_tb_ngay: s.avg_vol_tb_ngay,
                    combined_kl_tb_ngay: s.avg_kl_tb_ngay,
                    combined_vol: s.total_vol,
                    combined_opr: s.weighted_opr,
                    combined_rot_lc: s.weighted_rot_lc,
                    combined_odr: s.weighted_odr,
                    combined_longtail: s.weighted_longtail
                });
            }
        });

        // 2. Size 2 Combinations
        for (let i = 0; i < candidateShops.length; i++) {
            for (let j = i + 1; j < candidateShops.length; j++) {
                const s1 = candidateShops[i];
                const s2 = candidateShops[j];

                // Check Flow 2 criteria
                const fitsFlow2 = s1.pct_top_tinh_giao > 0.30 && s2.pct_top_tinh_giao > 0.30 && 
                                  (s1.kl_tb_ngay_top_tinh_giao + s2.kl_tb_ngay_top_tinh_giao) >= 5000;

                const combinedVol = s1.total_vol + s2.total_vol;
                const combinedOpr = combinedVol > 0 ? ((s1.weighted_opr * s1.total_vol) + (s2.weighted_opr * s2.total_vol)) / combinedVol : 0;
                const combinedRotLc = combinedVol > 0 ? ((s1.weighted_rot_lc * s1.total_vol) + (s2.weighted_rot_lc * s2.total_vol)) / combinedVol : 0;
                const combinedOdr = combinedVol > 0 ? ((s1.weighted_odr * s1.total_vol) + (s2.weighted_odr * s2.total_vol)) / combinedVol : 0;
                const combinedLongtail = combinedVol > 0 ? ((s1.weighted_longtail * s1.total_vol) + (s2.weighted_longtail * s2.total_vol)) / combinedVol : 0;

                if (fitsFlow2) {
                    allProposals.push({
                        is_single: false,
                        quan,
                        warehouse_name: whName,
                        flow_type: '2',
                        KTC: ktcDest,
                        shops: [s1, s2],
                        combined_vol_tb_ngay: s1.vol_tb_ngay_top_tinh_giao + s2.vol_tb_ngay_top_tinh_giao,
                        combined_kl_tb_ngay: s1.kl_tb_ngay_top_tinh_giao + s2.kl_tb_ngay_top_tinh_giao,
                        combined_vol: combinedVol,
                        combined_opr: combinedOpr,
                        combined_rot_lc: combinedRotLc,
                        combined_odr: combinedOdr,
                        combined_longtail: combinedLongtail
                    });
                } else {
                    allProposals.push({
                        is_single: false,
                        quan,
                        warehouse_name: whName,
                        flow_type: '1',
                        KTC: ktcDest,
                        shops: [s1, s2],
                        combined_vol_tb_ngay: s1.avg_vol_tb_ngay + s2.avg_vol_tb_ngay,
                        combined_kl_tb_ngay: s1.avg_kl_tb_ngay + s2.avg_kl_tb_ngay,
                        combined_vol: combinedVol,
                        combined_opr: combinedOpr,
                        combined_rot_lc: combinedRotLc,
                        combined_odr: combinedOdr,
                        combined_longtail: combinedLongtail
                    });
                }
            }
        }

        // 3. Size 3 Combinations
        for (let i = 0; i < candidateShops.length; i++) {
            for (let j = i + 1; j < candidateShops.length; j++) {
                for (let k = j + 1; k < candidateShops.length; k++) {
                    const s1 = candidateShops[i];
                    const s2 = candidateShops[j];
                    const s3 = candidateShops[k];

                    // Check Flow 2 criteria
                    const fitsFlow2 = s1.pct_top_tinh_giao > 0.30 && s2.pct_top_tinh_giao > 0.30 && s3.pct_top_tinh_giao > 0.30 &&
                                      (s1.kl_tb_ngay_top_tinh_giao + s2.kl_tb_ngay_top_tinh_giao + s3.kl_tb_ngay_top_tinh_giao) >= 5000;

                    const combinedVol = s1.total_vol + s2.total_vol + s3.total_vol;
                    const combinedOpr = combinedVol > 0 ? 
                        ((s1.weighted_opr * s1.total_vol) + (s2.weighted_opr * s2.total_vol) + (s3.weighted_opr * s3.total_vol)) / combinedVol : 0;
                    const combinedRotLc = combinedVol > 0 ? 
                        ((s1.weighted_rot_lc * s1.total_vol) + (s2.weighted_rot_lc * s2.total_vol) + (s3.weighted_rot_lc * s3.total_vol)) / combinedVol : 0;
                    const combinedOdr = combinedVol > 0 ? 
                        ((s1.weighted_odr * s1.total_vol) + (s2.weighted_odr * s2.total_vol) + (s3.weighted_odr * s3.total_vol)) / combinedVol : 0;
                    const combinedLongtail = combinedVol > 0 ? 
                        ((s1.weighted_longtail * s1.total_vol) + (s2.weighted_longtail * s2.total_vol) + (s3.weighted_longtail * s3.total_vol)) / combinedVol : 0;

                    if (fitsFlow2) {
                        allProposals.push({
                            is_single: false,
                            quan,
                            warehouse_name: whName,
                            flow_type: '2',
                            KTC: ktcDest,
                            shops: [s1, s2, s3],
                            combined_vol_tb_ngay: s1.vol_tb_ngay_top_tinh_giao + s2.vol_tb_ngay_top_tinh_giao + s3.vol_tb_ngay_top_tinh_giao,
                            combined_kl_tb_ngay: s1.kl_tb_ngay_top_tinh_giao + s2.kl_tb_ngay_top_tinh_giao + s3.kl_tb_ngay_top_tinh_giao,
                            combined_vol: combinedVol,
                            combined_opr: combinedOpr,
                            combined_rot_lc: combinedRotLc,
                            combined_odr: combinedOdr,
                            combined_longtail: combinedLongtail
                        });
                    } else {
                        allProposals.push({
                            is_single: false,
                            quan,
                            warehouse_name: whName,
                            flow_type: '1',
                            KTC: ktcDest,
                            shops: [s1, s2, s3],
                            combined_vol_tb_ngay: s1.avg_vol_tb_ngay + s2.avg_vol_tb_ngay + s3.avg_vol_tb_ngay,
                            combined_kl_tb_ngay: s1.avg_kl_tb_ngay + s2.avg_kl_tb_ngay + s3.avg_kl_tb_ngay,
                            combined_vol: combinedVol,
                            combined_opr: combinedOpr,
                            combined_rot_lc: combinedRotLc,
                            combined_odr: combinedOdr,
                            combined_longtail: combinedLongtail
                        });
                    }
                }
            }
        }
    });

    // Sort: prioritize Flow 2 first, then Flow 1. Within each flow, sort by weight descending!
    allProposals.sort((a, b) => {
        if (a.flow_type !== b.flow_type) {
            // '2' goes first, '1' goes second
            return b.flow_type.localeCompare(a.flow_type);
        }
        return b.combined_kl_tb_ngay - a.combined_kl_tb_ngay;
    });

    // Greedy Selection: each shop appears in at most one suggestion
    const usedShopKeys = new Set();
    const uniqueRecs = allProposals.filter(rec => {
        const keys = rec.shops.map(s => `${rec.quan}|${rec.warehouse_name}|${s.ten_kh}`);
        if (keys.some(k => usedShopKeys.has(k))) return false;
        keys.forEach(k => usedShopKeys.add(k));
        return true;
    });

    return uniqueRecs;
}

// Render recommendations list into the grouping table
function updateGroupingTab() {
    const table = document.querySelector('#grouping-table tbody');
    if (!table) return;
    table.innerHTML = '';

    const groups = calculateShopGroups();

    const minWeight = parseInt(document.getElementById('grouping-min-weight')?.value || 100, 10);
    const groupSize = document.getElementById('grouping-size')?.value || 'all';
    const groupTruck = document.getElementById('grouping-truck-type')?.value || 'all';
    const groupFlow = document.getElementById('grouping-flow')?.value || 'all';
    const searchQuery = (document.getElementById('grouping-search')?.value || '').trim().toLowerCase();

    let filteredGroups = groups.filter(g => {
        if (g.combined_kl_tb_ngay < minWeight) return false;
        if (groupSize === 'single' && !g.is_single) return false;
        if (groupSize === 'group' && g.is_single) return false;
        if (groupSize === '2' && g.shops.length !== 2) return false;
        if (groupSize === '3' && g.shops.length !== 3) return false;
        if (groupFlow !== 'all' && g.flow_type !== groupFlow) return false;

        // Determine truck match based on logistics market rules
        let truckSize = 'Xe 1.9T';
        let truckWeightLimit = 1900;
        const w = g.combined_kl_tb_ngay;
        
        if (g.flow_type === '2') {
            // Direct destination KTC uses 5T or 8T to optimize cost!
            if (w >= 5000) {
                truckSize = 'Xe 8T';
                truckWeightLimit = 8000;
            } else {
                truckSize = 'Xe 5T';
                truckWeightLimit = 5000;
            }
        } else {
            // Origin KTC uses smaller trucks like 1.9T or 2.5T!
            if (w >= 2500) {
                truckSize = 'Xe 2.5T';
                truckWeightLimit = 2500;
            } else {
                truckSize = 'Xe 1.9T';
                truckWeightLimit = 1900;
            }
        }

        if (groupTruck !== 'all' && truckSize !== `Xe ${groupTruck}`) return false;

        if (searchQuery) {
            const matchHub = g.warehouse_name.toLowerCase().includes(searchQuery);
            const matchQuan = g.quan.toLowerCase().includes(searchQuery);
            const matchKtc = g.KTC.toLowerCase().includes(searchQuery);
            if (!matchHub && !matchQuan && !matchKtc) return false;
        }
        return true;
    });

    if (filteredGroups.length === 0) {
        table.innerHTML = '<tr><td colspan="15" style="text-align: center; padding: 2rem; color: var(--text-muted);">Không tìm thấy đề xuất gom nhóm nào phù hợp với bộ lọc.</td></tr>';
        return;
    }

    filteredGroups.forEach((g, idx) => {
        const tr = document.createElement('tr');

        let oprBg = '';
        if (g.combined_opr < 0.85) oprBg = '#ef4444';
        else if (g.combined_opr < 0.90) oprBg = '#f97316';
        else if (g.combined_opr < 0.95) oprBg = '#eab308';
        else oprBg = '#22c55e';

        let rotLcBg = '';
        if (g.combined_rot_lc <= 0.02) rotLcBg = '#22c55e';
        else if (g.combined_rot_lc <= 0.05) rotLcBg = '#eab308';
        else if (g.combined_rot_lc <= 0.10) rotLcBg = '#f97316';
        else rotLcBg = '#ef4444';

        let odrBg = '';
        if (g.combined_odr < 0.85) odrBg = '#ef4444';
        else if (g.combined_odr < 0.90) odrBg = '#f97316';
        else if (g.combined_odr < 0.95) odrBg = '#eab308';
        else odrBg = '#22c55e';

        let longtailBg = '';
        if (g.combined_longtail <= 0.05) longtailBg = '#22c55e';
        else if (g.combined_longtail <= 0.10) longtailBg = '#eab308';
        else if (g.combined_longtail <= 0.15) longtailBg = '#f97316';
        else longtailBg = '#ef4444';

        let statusBadge = '';
        if (g.combined_odr < 0.90 || g.combined_longtail > 0.08) {
            statusBadge = '<span class="badge" style="background: linear-gradient(135deg, rgba(239, 68, 68, 0.2), rgba(249, 115, 22, 0.2)); color: #f43f5e; border: 1px solid rgba(239, 68, 68, 0.3); font-weight: 600;">Cải Thiện SLA</span>';
        } else if (g.combined_kl_tb_ngay >= 5000) {
            statusBadge = '<span class="badge" style="background: linear-gradient(135deg, rgba(34, 197, 94, 0.2), rgba(20, 184, 166, 0.2)); color: #4ade80; border: 1px solid rgba(34, 197, 94, 0.3); font-weight: 600;">Xe Đại Tải Tuyến</span>';
        } else if (g.combined_kl_tb_ngay >= 1900) {
            statusBadge = '<span class="badge" style="background: linear-gradient(135deg, rgba(59, 130, 246, 0.2), rgba(56, 189, 248, 0.2)); color: #60a5fa; border: 1px solid rgba(59, 130, 246, 0.3); font-weight: 600;">Đủ Tải Xe Đơn</span>';
        } else if (g.combined_kl_tb_ngay >= 500) {
            statusBadge = '<span class="badge" style="background: linear-gradient(135deg, rgba(249, 115, 22, 0.2), rgba(234, 179, 8, 0.2)); color: #fb923c; border: 1px solid rgba(249, 115, 22, 0.3); font-weight: 600;">Tiềm Năng Gom</span>';
        } else {
            statusBadge = '<span class="badge" style="background-color: rgba(148, 163, 184, 0.15); color: #94a3b8; border: 1px solid rgba(148, 163, 184, 0.2);">Cần Gom Thêm</span>';
        }

        // Render Routing Flow Badge
        let flowBadge = '';
        if (g.flow_type === '2') {
            flowBadge = '<span class="badge badge-flow-2"><i class="bx bx-navigation"></i> Luồng 2 (Đi thẳng)</span>';
        } else {
            flowBadge = '<span class="badge badge-flow-1"><i class="bx bx-git-merge"></i> Luồng 1 (Qua Sort)</span>';
        }

        // Render KTC destination hub (always list the KTC code for all shops in the group/single proposal)
        const ktcList = Array.from(new Set(g.shops.map(s => s.KTC || 'Không rõ'))).join(', ');
        let ktcText = `<span class="badge-ktc"><i class="bx bx-map-pin"></i> ${ktcList}</span>`;

        let shopListHtml = '<div style="display: flex; flex-direction: column; gap: 0.4rem; padding: 0.2rem 0;">';
        g.shops.forEach(s => {
            let shopOprColor = s.weighted_opr < 0.9 ? '#f43f5e' : '#14b8a6';
            let shopRotLcColor = s.weighted_rot_lc > 0.02 ? '#f43f5e' : '#14b8a6';
            let shopOdrColor = s.weighted_odr < 0.92 ? '#f43f5e' : '#14b8a6';
            let shopLongtailColor = s.weighted_longtail > 0.08 ? '#f43f5e' : '#14b8a6';
            
            // Routing weight is top province weight for flow 2, else total weight
            const shopWeight = g.flow_type === '2' ? s.kl_tb_ngay_top_tinh_giao : s.avg_kl_tb_ngay;
            const shopVol = g.flow_type === '2' ? s.vol_tb_ngay_top_tinh_giao : s.avg_vol_tb_ngay;
            
            shopListHtml += `
                <div style="display: flex; align-items: center; justify-content: space-between; gap: 0.5rem; background: rgba(51, 65, 85, 0.4); padding: 0.3rem 0.6rem; border-radius: 6px; border: 1px solid rgba(51, 65, 85, 0.6); white-space: nowrap;">
                    <div style="display: flex; flex-direction: column; text-align: left; gap: 0.1rem; flex-grow: 1; min-width: 0;">
                        <span style="font-weight: 600; color: #f8fafc; font-size: 0.82rem; max-width: 200px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${s.ten_kh}">${s.ten_kh}</span>
                        <span style="font-size: 0.7rem; color: var(--text-muted); font-weight: 500;">Loại: ${s.loai_kh} | KL Tuyến: ${shopWeight.toFixed(1)} Kg/n</span>
                    </div>
                    <div style="display: flex; gap: 0.3rem; flex-shrink: 0; align-items: center;">
                        <span class="badge" style="background-color: rgba(59, 130, 246, 0.15); color: #60a5fa; font-family: monospace; font-size: 0.72rem; padding: 0.15rem 0.4rem;">${formatNumber(shopVol)} đơn</span>
                        <span class="badge" style="background-color: rgba(239, 68, 68, 0.15); color: ${shopRotLcColor}; font-family: monospace; font-size: 0.72rem; padding: 0.15rem 0.4rem;">Rớt: ${formatPercent(s.weighted_rot_lc)}</span>
                        <span class="badge" style="background-color: rgba(20, 184, 166, 0.15); color: ${shopOprColor}; font-family: monospace; font-size: 0.72rem; padding: 0.15rem 0.4rem;">OPR: ${formatPercent(s.weighted_opr)}</span>
                        <span class="badge" style="background-color: rgba(20, 184, 166, 0.15); color: ${shopOdrColor}; font-family: monospace; font-size: 0.72rem; padding: 0.15rem 0.4rem;">ODR: ${formatPercent(s.weighted_odr)}</span>
                        <span class="badge" style="background-color: rgba(249, 115, 22, 0.15); color: ${shopLongtailColor}; font-family: monospace; font-size: 0.72rem; padding: 0.15rem 0.4rem;">LT: ${formatPercent(s.weighted_longtail)}</span>
                    </div>
                </div>
            `;
        });
        shopListHtml += '</div>';

        // Calculate Truck Optimization Visuals based on dynamically assigned truck capacities
        let truckSize = 'Xe 1.9T';
        let truckWeightLimit = 1900;
        const w = g.combined_kl_tb_ngay;
        
        if (g.flow_type === '2') {
            if (w >= 5000) {
                truckSize = 'Xe 8T';
                truckWeightLimit = 8000;
            } else {
                truckSize = 'Xe 5T';
                truckWeightLimit = 5000;
            }
        } else {
            if (w >= 2500) {
                truckSize = 'Xe 2.5T';
                truckWeightLimit = 2500;
            } else {
                truckSize = 'Xe 1.9T';
                truckWeightLimit = 1900;
            }
        }

        const utilizationPct = Math.min(100, (w / truckWeightLimit) * 100);
        
        let progressBarColor = '#f97316'; // orange (low utilization)
        if (utilizationPct >= 80) progressBarColor = '#22c55e'; // green (excellent)
        else if (utilizationPct >= 50) progressBarColor = '#3b82f6'; // blue (good)
        else if (utilizationPct >= 30) progressBarColor = '#eab308'; // yellow (average)

        const truckIconHtml = `<span class="truck-icon-inline"><i class="bx bxs-truck"></i></span>`;

        const truckCapacityHtml = `
            <div class="truck-capacity-wrapper">
                <span class="truck-meta">${truckIconHtml} <strong>${truckSize}</strong></span>
                <div class="truck-cap-progress">
                    <div class="truck-cap-bar" style="width: ${utilizationPct}%; background: ${progressBarColor};"></div>
                </div>
                <span style="font-size: 0.72rem; color: var(--text-muted); font-weight: 600; font-family: monospace;">
                    ${w.toFixed(1)} Kg / ${truckWeightLimit} Kg (${utilizationPct.toFixed(1)}%)
                </span>
            </div>
        `;

        const progressPct = Math.min(100, (g.combined_vol_tb_ngay / 1000) * 100);
        const barColor = g.combined_vol_tb_ngay >= 1000 ? 'var(--accent-teal)' : 'var(--accent-blue)';
        const volProgressHtml = `
            <div style="display: flex; flex-direction: column; align-items: flex-end; gap: 0.3rem;">
                <span style="font-weight: bold; color: var(--accent-blue); font-size: 0.95rem; font-family: monospace;">${formatNumber(g.combined_vol_tb_ngay)} đơn</span>
                <div style="width: 100px; height: 5px; background: rgba(51, 65, 85, 0.6); border-radius: 3px; overflow: hidden;">
                    <div style="width: ${progressPct}%; height: 100%; background: ${barColor}; border-radius: 3px;"></div>
                </div>
            </div>
        `;

        const klProgressPct = Math.min(100, (g.combined_kl_tb_ngay / 2000) * 100); // normalized to 2000kg
        const klProgressHtml = `
            <div style="display: flex; flex-direction: column; align-items: flex-end; gap: 0.3rem;">
                <span style="font-weight: bold; color: var(--accent-teal); font-size: 0.95rem; font-family: monospace;">${formatFloat(g.combined_kl_tb_ngay, 1)} kg</span>
                <div style="width: 100px; height: 5px; background: rgba(51, 65, 85, 0.6); border-radius: 3px; overflow: hidden;">
                    <div style="width: ${klProgressPct}%; height: 100%; background: var(--accent-teal); border-radius: 3px;"></div>
                </div>
            </div>
        `;

        const scaleBadge = g.is_single
            ? `<span class="badge" style="background-color: rgba(34, 197, 94, 0.15); color: #4ade80; border: 1px solid rgba(34, 197, 94, 0.3); font-weight: bold;">Xe Đơn (1 Shop)</span>`
            : `<span class="badge" style="background-color: ${g.shops.length === 3 ? 'rgba(139, 92, 246, 0.15)' : 'rgba(56, 189, 248, 0.15)'}; color: ${g.shops.length === 3 ? '#a78bfa' : '#38bdf8'}; font-weight: bold;">Gom ${g.shops.length} Shop</span>`;

        tr.innerHTML = `
            <td style="text-align: center;"><span style="display: inline-block; width: 28px; height: 28px; line-height: 28px; border-radius: 50%; background: ${idx === 0 ? 'rgba(234, 179, 8, 0.2)' : idx === 1 ? 'rgba(148, 163, 184, 0.2)' : 'rgba(115, 115, 115, 0.2)'}; color: ${idx === 0 ? '#facc15' : idx === 1 ? '#cbd5e1' : '#a3a3a3'}; font-weight: bold; font-size: 0.85rem; border: 1px solid ${idx === 0 ? '#facc15' : idx === 1 ? '#cbd5e1' : 'transparent'};">${idx + 1}</span></td>
            <td style="font-weight: 700; color: white;">${g.warehouse_name}</td>
            <td style="color: var(--text-muted); font-weight: 500;">${g.quan}</td>
            <td style="text-align: center;">${scaleBadge}</td>
            <td style="text-align: center; vertical-align: middle;">${flowBadge}</td>
            <td style="text-align: center; vertical-align: middle;">${ktcText}</td>
            <td>${shopListHtml}</td>
            <td style="text-align: right; vertical-align: middle;">${volProgressHtml}</td>
            <td style="text-align: right; vertical-align: middle;">${klProgressHtml}</td>
            <td style="text-align: right; vertical-align: middle;">${truckCapacityHtml}</td>
            <td style="text-align: center; vertical-align: middle;"><span class="badge" style="background-color: ${rotLcBg}; color: white; font-weight: bold; font-family: monospace; font-size: 0.85rem;">${formatPercent(g.combined_rot_lc)}</span></td>
            <td style="text-align: center; vertical-align: middle;"><span class="badge" style="background-color: ${oprBg}; color: white; font-weight: bold; font-family: monospace; font-size: 0.85rem;">${formatPercent(g.combined_opr)}</span></td>
            <td style="text-align: center; vertical-align: middle;"><span class="badge" style="background-color: ${odrBg}; color: white; font-weight: bold; font-family: monospace; font-size: 0.85rem;">${formatPercent(g.combined_odr)}</span></td>
            <td style="text-align: center; vertical-align: middle;"><span class="badge" style="background-color: ${longtailBg}; color: white; font-weight: bold; font-family: monospace; font-size: 0.85rem;">${formatPercent(g.combined_longtail)}</span></td>
            <td style="text-align: center; vertical-align: middle;">${statusBadge}</td>
        `;
        table.appendChild(tr);
    });
}

function updateVolumeBreakdown() {
    const tbody = document.querySelector('#volume-breakdown-table tbody');
    const barsContainer = document.getElementById('volume-bars-container');
    if (!tbody || !barsContainer) return;
    
    tbody.innerHTML = '';
    barsContainer.innerHTML = '';
    
    const segments = [
        '1. Duoi 100 don/ngay',
        '2. 100 - 300 don/ngay',
        '3. 300 - 500 don/ngay',
        '4. 500 - 1000 don/ngay',
        '5. Trên 1000 don/ngay'
    ];
    
    const counts = {};
    segments.forEach(seg => {
        counts[seg] = {
            segment: seg,
            shopCount: 0,
            totalVol: 0,
            totalWeight: 0
        };
    });
    
    let totalFilteredShops = 0;
    filteredData.forEach(row => {
        const seg = row.nhom_san_luong;
        if (counts[seg]) {
            counts[seg].shopCount++;
            counts[seg].totalVol += row.vol || 0;
            counts[seg].totalWeight += row['kl(kg)'] || 0;
            totalFilteredShops++;
        }
    });
    
    segments.forEach(seg => {
        const data = counts[seg];
        const pct = totalFilteredShops > 0 ? (data.shopCount / totalFilteredShops) : 0;
        
        const shopCountStr = formatNumber(data.shopCount);
        const totalVolStr = formatNumber(data.totalVol);
        const totalWeightStr = formatNumber(data.totalWeight);
        const pctStr = formatPercent(pct);
        
        let badgeColor = '';
        let barBgColor = '';
        if (seg.startsWith('1')) { badgeColor = 'rgba(148, 163, 184, 0.15); color: #94a3b8;'; barBgColor = '#94a3b8'; }
        else if (seg.startsWith('2')) { badgeColor = 'rgba(59, 130, 246, 0.15); color: #60a5fa;'; barBgColor = '#3b82f6'; }
        else if (seg.startsWith('3')) { badgeColor = 'rgba(20, 184, 166, 0.15); color: #2dd4bf;'; barBgColor = '#14b8a6'; }
        else if (seg.startsWith('4')) { badgeColor = 'rgba(168, 85, 247, 0.15); color: #c084fc;'; barBgColor = '#a855f7'; }
        else { badgeColor = 'rgba(239, 68, 68, 0.15); color: #f87171;'; barBgColor = '#ef4444'; }
        
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td><span class="badge" style="${badgeColor} font-weight: 600;">${seg}</span></td>
            <td style="text-align: right; font-weight: bold; color: white;">${shopCountStr}</td>
            <td style="text-align: right; color: var(--accent-blue); font-weight: 500;">${totalVolStr}</td>
            <td style="text-align: right; color: var(--accent-teal); font-weight: 500;">${totalWeightStr}</td>
            <td style="text-align: center; font-weight: bold; color: #cbd5e1;">${pctStr}</td>
        `;
        tbody.appendChild(tr);
        
        const barDiv = document.createElement('div');
        barDiv.className = 'volume-bar-item';
        barDiv.style.cssText = 'display: flex; flex-direction: column; gap: 0.3rem;';
        barDiv.innerHTML = `
            <div style="display: flex; justify-content: space-between; align-items: center; font-size: 0.8rem;">
                <span style="font-weight: 500; color: #e2e8f0;">${seg}</span>
                <span style="font-weight: bold; color: ${barBgColor};">${shopCountStr} shop (${pctStr})</span>
            </div>
            <div style="width: 100%; height: 8px; background: rgba(51, 65, 85, 0.6); border-radius: 4px; overflow: hidden;">
                <div style="width: ${pct * 100}%; height: 100%; background: ${barBgColor}; border-radius: 4px; transition: width 0.3s ease;"></div>
            </div>
        `;
        barsContainer.appendChild(barDiv);
    });
}
