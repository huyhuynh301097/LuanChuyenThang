// Global State
let rawData = [];
let filteredData = [];
let charts = {};

// Filter State
const filters = {
    month: new Set(),
    region: new Set(),
    province: new Set(),
    district: new Set(),
    volumeGroup: new Set(),
    hubType: new Set(),
    hub: new Set()
};

// Initialize Application
document.addEventListener('DOMContentLoaded', () => {
    loadData();
    setupEventListeners();
});

// Load and Parse CSV Data
function loadData() {
    Papa.parse('data.csv', {
        download: true,
        header: true,
        dynamicTyping: true,
        complete: function(results) {
            console.log("=== GHN CSV Loading Debug ===");
            console.log("1. Total raw lines parsed from CSV:", results.data ? results.data.length : 0);
            if (results.errors && results.errors.length > 0) {
                console.error("2. PapaParse encountered errors:", results.errors);
            }
            
            // Process Data: Add custom volume group based on user logic
            rawData = results.data.filter(row => {
                return row.warehouse_id !== null && row.warehouse_id !== undefined;
            }).map(row => {
                const volTbNgay = row.vol_tb_ngay || 0;
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

                // Map new schema fields to keep compatibility with existing code
                const kl = row.kl !== undefined ? row.kl : (row['kl(kg)'] || 0);
                const soNgay = row.so_ngay !== undefined ? row.so_ngay : (row.so_ngay_phat_sinh_don || 0);
                const soNgay1000 = row.so_ngay_tren_1000 !== undefined ? row.so_ngay_tren_1000 : (row.so_ngay_tren_1000_don || 0);
                const klTbNgay = row.kl_tb_ngay !== undefined ? row.kl_tb_ngay : (row['kl_tb_ngay(kg)'] || 0);
                const pctDuoi5kg = row.pct_duoi_5kg !== undefined ? row.pct_duoi_5kg : (row.pct_don_duoi_5kg || 0);
                const pctNoiVung = row.pct_noi_vung !== undefined ? row.pct_noi_vung : (row.pct_don_noi_vung || 0);
                const pctLienVung = row.pct_lien_vung !== undefined ? row.pct_don_lien_vung : (row.pct_don_lien_vung || 0);

                return {
                    ...row,
                    nhom_san_luong: nhomSanLuong,
                    hub_type: hubType,
                    // Handled properties
                    vol: row.vol || 0,
                    'kl(kg)': kl,
                    so_ngay_phat_sinh_don: soNgay,
                    so_ngay_tren_1000_don: soNgay1000,
                    'kl_tb_ngay(kg)': klTbNgay,
                    pct_don_duoi_5kg: pctDuoi5kg,
                    pct_don_noi_vung: pctNoiVung,
                    pct_don_lien_vung: pctLienVung,
                    pct_opr: row.pct_opr || 0,
                    pct_rot_lc: row.pct_rot_lc || 0,
                    // New indicators
                    vol_delivered: row.vol_delivered || 0,
                    pct_odr: row.pct_odr || 0,
                    pct_longtail: row.pct_longtail || 0
                };
            });

            console.log("3. Total rawData rows mapped successfully:", rawData.length);
            if (rawData.length > 0) {
                console.log("4. Sample row data:", rawData[0]);
            }

            filteredData = [...rawData];
            
            initializeFilters();
            updateDashboard();
        },
        error: function(err) {
            console.error("Error loading CSV:", err);
            alert("Không thể tải dữ liệu. Vui lòng kiểm tra file data.csv");
        }
    });
}

function initializeFilters() {
    populateCheckboxes('filter-month', [...new Set(rawData.map(d => d.thang).filter(Boolean))].sort());
    populateCheckboxes('filter-region', [...new Set(rawData.map(d => d.vung).filter(Boolean))].sort());
    populateCheckboxes('filter-province', [...new Set(rawData.map(d => d.tinh).filter(Boolean))].sort());
    populateCheckboxes('filter-district', [...new Set(rawData.map(d => d.quan).filter(Boolean))].sort());
    populateCheckboxes('filter-hub-type', ['KHL', 'Bưu Cục']);
    populateCheckboxes('filter-hub', [...new Set(rawData.map(d => d.warehouse_name).filter(Boolean))].sort());
}

function populateCheckboxes(elementId, options) {
    const container = document.getElementById(elementId);
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
        { id: 'filter-volume', prop: 'volumeGroup' },
        { id: 'filter-hub-type', prop: 'hubType' },
        { id: 'filter-hub', prop: 'hub' }
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
        const groupVolSlider = document.getElementById('grouping-min-vol');
        if (groupVolSlider) {
            groupVolSlider.value = 300;
            const label = document.getElementById('grouping-vol-val');
            if (label) label.textContent = '300 đơn';
        }
        const groupSizeSelect = document.getElementById('grouping-size');
        if (groupSizeSelect) groupSizeSelect.value = 'all';
        
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
    const groupVolSlider = document.getElementById('grouping-min-vol');
    if (groupVolSlider) {
        groupVolSlider.addEventListener('input', (e) => {
            const label = document.getElementById('grouping-vol-val');
            if (label) label.textContent = `${e.target.value} đơn`;
            updateGroupingTab();
        });
    }

    document.getElementById('grouping-size')?.addEventListener('change', updateGroupingTab);
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
        const matchVolume = filters.volumeGroup.size === 0 || filters.volumeGroup.has(row.nhom_san_luong);
        const matchHubType = filters.hubType.size === 0 || filters.hubType.has(row.hub_type);
        const matchHub = filters.hub.size === 0 || filters.hub.has(row.warehouse_name);

        return matchMonth && matchRegion && matchProvince && matchDistrict && matchVolume && matchHubType && matchHub;
    });

    updateDashboard();
}

// Update Entire Dashboard
function updateDashboard() {
    updateScorecards();
    renderCharts();
    updateTable();
    generateAlerts();
    renderHeatmaps();
    updateTrendShopOptions();
    updateGroupingTab();
}

// Formatter Helpers
const formatNumber = (num) => new Intl.NumberFormat('vi-VN').format(Math.round(num));
const formatPercent = (num) => (num * 100).toFixed(2) + '%';

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
    
    // Weighted Average ODR & Longtail (weighted by vol_delivered)
    let totalOdrDelivered = 0;
    let totalLongtailDelivered = 0;
    let totalDeliveredVol = 0;
    filteredData.forEach(row => {
        totalOdrDelivered += ((row.pct_odr || 0) * (row.vol_delivered || 0));
        totalLongtailDelivered += ((row.pct_longtail || 0) * (row.vol_delivered || 0));
        totalDeliveredVol += (row.vol_delivered || 0);
    });
    const avgOdr = totalDeliveredVol > 0 ? (totalOdrDelivered / totalDeliveredVol) : 0;
    const avgLongtail = totalDeliveredVol > 0 ? (totalLongtailDelivered / totalDeliveredVol) : 0;
    
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
    renderTopShopsChart();
    renderShopDistributionChart();
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


function renderTopShopsChart() {
    const ctx = document.getElementById('chart-top-shops').getContext('2d');
    
    // Sort raw shops by vol_tb_ngay
    const sortedShops = [...filteredData]
        .sort((a, b) => b.vol_tb_ngay - a.vol_tb_ngay)
        .slice(0, 15);

    const labels = sortedShops.map(s => {
        let name = s.ten_kh || s.warehouse_name || 'Unknown';
        return name.length > 25 ? name.substring(0, 25) + '...' : name;
    });
    const data = sortedShops.map(s => s.vol_tb_ngay);
    const oprs = sortedShops.map(s => s.pct_opr * 100);

    if (charts.topShops) charts.topShops.destroy();

    charts.topShops = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: 'Sản Lượng (Đơn/Ngày)',
                data: data,
                backgroundColor: sortedShops.map(s => ((s.pct_opr * 100) < 90 || (s.pct_rot_lc || 0) > 0.02) ? 'rgba(239, 68, 68, 0.8)' : 'rgba(168, 85, 247, 0.8)'),
                borderRadius: 4
            }]
        },
        options: {
            indexAxis: 'y', // Horizontal bar chart
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                x: { grid: { color: 'rgba(51, 65, 85, 0.5)' } },
                y: { grid: { display: false } }
            },
            plugins: {
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            return `Sản lượng: ${Math.round(context.raw).toLocaleString()} Đơn`;
                        },
                        afterLabel: function(context) {
                            const shop = sortedShops[context.dataIndex];
                            return [
                                `Khối lượng TB: ${Math.round(shop['kl_tb_ngay(kg)'] || 0).toLocaleString()} Kg/Ngày`,
                                `OPR: ${oprs[context.dataIndex].toFixed(1)}%`,
                                `% Rớt LC: ${((shop.pct_rot_lc || 0) * 100).toFixed(1)}%`,
                                `Số ngày >1000 đơn: ${shop.so_ngay_tren_1000_don || 0} ngày`,
                                `${shop.warehouse_name || 'Không rõ'}`
                            ];
                        }
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



function renderShopDistributionChart() {
    const ctx = document.getElementById('chart-shop-distribution').getContext('2d');
    
    const dist = {
        '1. Duoi 100 don/ngay': 0,
        '2. 100 - 300 don/ngay': 0,
        '3. 300 - 500 don/ngay': 0,
        '4. 500 - 1000 don/ngay': 0,
        '5. Trên 1000 don/ngay': 0
    };

    filteredData.forEach(row => {
        if (dist[row.nhom_san_luong] !== undefined) {
            dist[row.nhom_san_luong]++;
        }
    });

    if (charts.shopDist) charts.shopDist.destroy();

    const chartLabels = Object.keys(dist).map(key => `${key}: ${dist[key]} Shop`);

    charts.shopDist = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: chartLabels,
            datasets: [{
                data: Object.values(dist),
                backgroundColor: [
                    'rgba(148, 163, 184, 0.8)',
                    'rgba(56, 189, 248, 0.8)',
                    'rgba(59, 130, 246, 0.8)',
                    'rgba(20, 184, 166, 0.8)',
                    'rgba(168, 85, 247, 0.8)'
                ],
                borderWidth: 0,
                hoverOffset: 4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { 
                    display: true,
                    position: 'bottom',
                    labels: { color: 'rgba(241, 245, 249, 1)', padding: 10 }
                },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            return ` ${context.raw} Shop`;
                        }
                    }
                }
            },
            cutout: '65%'
        }
    });
}



// Update Detailed Data Table
function updateTable() {
    const tbody = document.querySelector('#details-table tbody');
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
        
        let badgeClass = 'badge-1';
        if (row.nhom_san_luong.startsWith('2')) badgeClass = 'badge-2';
        else if (row.nhom_san_luong.startsWith('3')) badgeClass = 'badge-3';
        else if (row.nhom_san_luong.startsWith('4')) badgeClass = 'badge-4';
        else if (row.nhom_san_luong.startsWith('5')) badgeClass = 'badge-5';

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
            <td style="color: var(--accent-blue); font-weight: bold;">${row.ten_kh || '-'}</td>
            <td style="font-family: monospace; color: var(--text-muted); font-size: 0.85rem; font-weight: 500;">${row.order_code_mau || '-'}</td>
            <td><span class="badge ${badgeClass}">${row.nhom_san_luong}</span></td>
            <td style="background-color: ${volBg}; font-weight: bold;">${formatNumber(row.vol)}</td>
            <td style="font-weight: bold; color: var(--text-main);">${formatNumber(row.vol_delivered || 0)}</td>
            <td>${formatNumber(row['kl(kg)'])}</td>
            <td>${row.so_ngay_phat_sinh_don || '-'}</td>
            <td>${row.so_ngay_tren_1000_don || '-'}</td>
            <td>${formatNumber(row.vol_tb_ngay)}</td>
            <td>${formatNumber(row['kl_tb_ngay(kg)'] || 0)}</td>
            <td>${formatPercent(row.pct_don_duoi_5kg || 0)}</td>
            <td>${formatPercent(row.pct_don_noi_vung || 0)}</td>
            <td>${formatPercent(row.pct_don_lien_vung || 0)}</td>
            <td style="background-color: ${rotLcBg}; color: white; font-weight: bold">${formatPercent(rotLc)}</td>
            <td style="background-color: ${oprBg}; color: white; font-weight: bold">${formatPercent(row.pct_opr)}</td>
            <td style="background-color: ${odrBg}; color: white; font-weight: bold">${formatPercent(row.pct_odr || 0)}</td>
            <td style="background-color: ${longtailBg}; color: white; font-weight: bold">${formatPercent(row.pct_longtail || 0)}</td>
            <td>${formatPercent(row.pct_gio_0_9 || 0)}</td>
            <td>${formatPercent(row.pct_gio_9_19 || 0)}</td>
            <td>${formatPercent(row.pct_gio_19p || 0)}</td>
        `;
        tbody.appendChild(tr);
    });

    if (tableData.length === 0) {
        tbody.innerHTML = '<tr><td colspan="26" style="text-align: center; padding: 2rem;">Không tìm thấy dữ liệu phù hợp với bộ lọc.</td></tr>';
    }
}

// Generate Alerts
function generateAlerts() {
    const alertsContainer = document.getElementById('alerts-container');
    alertsContainer.innerHTML = '';

    // Calculate OPR, % Rớt LC, ODR, and Longtail by District
    const districtData = {};
    filteredData.forEach(row => {
        const d = row.quan || 'Unknown';
        if (!districtData[d]) {
            districtData[d] = { 
                vol: 0, 
                totalOprVol: 0, 
                totalRotLcVol: 0, 
                totalOdrDelivered: 0,
                totalLongtailDelivered: 0,
                totalDeliveredVol: 0,
                vung: row.vung 
            };
        }
        districtData[d].vol += row.vol;
        districtData[d].totalOprVol += (row.pct_opr * row.vol);
        districtData[d].totalRotLcVol += ((row.pct_rot_lc || 0) * row.vol);
        districtData[d].totalOdrDelivered += ((row.pct_odr || 0) * (row.vol_delivered || 0));
        districtData[d].totalLongtailDelivered += ((row.pct_longtail || 0) * (row.vol_delivered || 0));
        districtData[d].totalDeliveredVol += (row.vol_delivered || 0);
    });

    const badDistricts = Object.entries(districtData)
        .map(([name, data]) => ({
            name,
            vung: data.vung,
            vol: data.vol,
            opr: data.vol > 0 ? (data.totalOprVol / data.vol) : 0,
            rotLc: data.vol > 0 ? (data.totalRotLcVol / data.vol) : 0,
            odr: data.totalDeliveredVol > 0 ? (data.totalOdrDelivered / data.totalDeliveredVol) : 0,
            longtail: data.totalDeliveredVol > 0 ? (data.totalLongtailDelivered / data.totalDeliveredVol) : 0
        }))
        // Filter districts that have low OPR, high Rot LC, low ODR, OR high Longtail, with minimum 100 volume
        .filter(d => (
            (d.opr > 0 && d.opr < 0.9) || 
            d.rotLc > 0.02 || 
            (d.odr > 0 && d.odr < 0.92) || 
            d.longtail > 0.08
        ) && d.vol >= 100)
        .sort((a, b) => {
            // Combined risk with 1.5x weight for SLA metrics (ODR, Longtail)
            const riskA = a.vol * ((1 - a.opr) + a.rotLc + 1.5 * (1 - a.odr) + 1.5 * a.longtail);
            const riskB = b.vol * ((1 - b.opr) + b.rotLc + 1.5 * (1 - b.odr) + 1.5 * b.longtail);
            return riskB - riskA; // High combined risk first
        });

    if (badDistricts.length > 0) {
        // Only show top 3 alerts to avoid clutter
        badDistricts.slice(0, 3).forEach(d => {
            const alertCard = document.createElement('div');
            alertCard.className = 'alert-card';
            alertCard.innerHTML = `
                <i class='bx bx-error-circle'></i>
                <div class="alert-content">
                    <h4>Cảnh Báo Quận/Huyện: Suy Giảm Chất Lượng tại ${d.name} (${d.vung})</h4>
                    <p>SLA giao nhận bị ảnh hưởng lớn: ODR chỉ đạt <strong style="color: ${d.odr < 0.90 ? '#ef4444' : '#f97316'}">${(d.odr * 100).toFixed(1)}%</strong>, tỷ lệ Longtail trễ hạn ở mức <strong style="color: ${d.longtail > 0.10 ? '#ef4444' : '#f97316'}">${(d.longtail * 100).toFixed(1)}%</strong>. Chỉ số vận hành OPR: <strong>${(d.opr * 100).toFixed(1)}%</strong>, Rớt LC: <strong>${(d.rotLc * 100).toFixed(1)}%</strong> (Tổng vol: ${formatNumber(d.vol)} đơn).</p>
                </div>
            `;
            alertsContainer.appendChild(alertCard);
        });
    }

    // Add Shop Alerts
    const badShops = [...filteredData]
        .filter(d => 
            (d.pct_opr > 0 && d.pct_opr < 0.9) || 
            d.pct_rot_lc > 0.02 ||
            (d.pct_odr > 0 && d.pct_odr < 0.92) ||
            d.pct_longtail > 0.08
        )
        .filter(d => d.vol_tb_ngay >= 10)
        .sort((a, b) => {
            const riskA = a.vol * ((1 - a.pct_opr) + (a.pct_rot_lc || 0) + 1.5 * (1 - a.pct_odr) + 1.5 * (a.pct_longtail || 0));
            const riskB = b.vol * ((1 - b.pct_opr) + (b.pct_rot_lc || 0) + 1.5 * (1 - b.pct_odr) + 1.5 * (b.pct_longtail || 0));
            return riskB - riskA; // High combined risk first
        });

    if (badShops.length > 0) {
        // Show up to 3 worst shops
        badShops.slice(0, 3).forEach(s => {
            const alertCard = document.createElement('div');
            alertCard.className = 'alert-card';
            alertCard.style.borderLeftColor = '#f43f5e';
            
            let shopAlertTitle = '';
            let shopAlertDesc = '';
            
            const sRotLc = s.pct_rot_lc || 0;
            const sOdr = s.pct_odr || 0;
            const sLongtail = s.pct_longtail || 0;
            
            if ((sOdr < 0.92 || sLongtail > 0.08) && (s.pct_opr < 0.9 || sRotLc > 0.02)) {
                shopAlertTitle = `Cảnh Báo Shop Suy Giảm SLA & Vận Hành: ${s.ten_kh}`;
                shopAlertDesc = `Shop đồng thời gặp ODR thấp <strong>${(sOdr * 100).toFixed(1)}%</strong> (Longtail: <strong>${(sLongtail * 100).toFixed(1)}%</strong>) và OPR kém <strong>${(s.pct_opr * 100).toFixed(1)}%</strong> tại BC ${s.warehouse_name}. Sản lượng TB ${formatNumber(s.vol_tb_ngay)} đơn/ngày.`;
            } else if (sOdr < 0.92 || sLongtail > 0.08) {
                shopAlertTitle = `Cảnh Báo Shop Trễ Hẹn SLA Giao: ${s.ten_kh}`;
                shopAlertDesc = `Chất lượng giao hàng kém tại BC ${s.warehouse_name}: ODR đạt <strong>${(sOdr * 100).toFixed(1)}%</strong>, tỷ lệ Longtail trễ hạn lên tới <strong style="color: #f43f5e">${(sLongtail * 100).toFixed(1)}%</strong>. Sản lượng TB ${formatNumber(s.vol_tb_ngay)} đơn/ngày (Tổng vol: ${formatNumber(s.vol)} đơn).`;
            } else if (sRotLc > 0.02) {
                shopAlertTitle = `Cảnh Báo Shop Rớt LC Cao: ${s.ten_kh}`;
                shopAlertDesc = `Tỷ lệ rớt luân chuyển cao ở mức <strong>${(sRotLc * 100).toFixed(1)}%</strong> tại BC ${s.warehouse_name}. Sản lượng TB ${formatNumber(s.vol_tb_ngay)} đơn/ngày (OPR: ${(s.pct_opr * 100).toFixed(1)}%).`;
            } else {
                shopAlertTitle = `Cảnh Báo Shop OPR Thấp: ${s.ten_kh}`;
                shopAlertDesc = `OPR rất thấp <strong>${(s.pct_opr * 100).toFixed(1)}%</strong> tại BC ${s.warehouse_name}. Sản lượng TB ${formatNumber(s.vol_tb_ngay)} đơn/ngày. Số ngày có vol > 1000 đơn: ${s.so_ngay_tren_1000_don || 0} ngày.`;
            }

            alertCard.innerHTML = `
                <i class='bx bx-store-alt' style="color: #f43f5e"></i>
                <div class="alert-content">
                    <h4 style="color: #f43f5e">${shopAlertTitle}</h4>
                    <p>${shopAlertDesc}</p>
                </div>
            `;
            alertsContainer.appendChild(alertCard);
        });
    }
}

// Generate Heatmaps
function renderHeatmaps() {
    const container = document.getElementById('heatmap-container');
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
                totalOdrDelivered: 0,
                totalLongtailDelivered: 0,
                totalDeliveredVol: 0
            };
        }
        regions[r][d].vol += row.vol;
        regions[r][d].totalOprVol += (row.pct_opr * row.vol);
        regions[r][d].totalRotLcVol += ((row.pct_rot_lc || 0) * row.vol);
        regions[r][d].totalOdrDelivered += ((row.pct_odr || 0) * (row.vol_delivered || 0));
        regions[r][d].totalLongtailDelivered += ((row.pct_longtail || 0) * (row.vol_delivered || 0));
        regions[r][d].totalDeliveredVol += (row.vol_delivered || 0);
    });

    Object.keys(regions).sort().forEach(r => {
        const districtObj = regions[r];
        const districts = Object.entries(districtObj).map(([name, data]) => ({
            name,
            vol: data.vol,
            opr: data.vol > 0 ? (data.totalOprVol / data.vol) : 0,
            rotLc: data.vol > 0 ? (data.totalRotLcVol / data.vol) : 0,
            odr: data.totalDeliveredVol > 0 ? (data.totalOdrDelivered / data.totalDeliveredVol) : 0,
            longtail: data.totalDeliveredVol > 0 ? (data.totalLongtailDelivered / data.totalDeliveredVol) : 0
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


// Calculate combinations of 2 and 3 shops for each (quan, warehouse_name) cluster
function calculateShopGroups() {
    const clusters = {};

    filteredData.forEach(row => {
        const quan = row.quan;
        const whName = row.warehouse_name;
        const shop = row.ten_kh;
        
        if (!quan || !whName || !shop) return;

        const clusterKey = `${quan} ||| ${whName}`;
        if (!clusters[clusterKey]) {
            clusters[clusterKey] = {};
        }

        if (!clusters[clusterKey][shop]) {
            clusters[clusterKey][shop] = {
                ten_kh: shop,
                vol: 0,
                vol_tb_ngay_sum: 0,
                vol_tb_ngay_count: 0,
                opr_vol_sum: 0,
                rot_lc_vol_sum: 0,
                odr_vol_sum: 0,
                longtail_vol_sum: 0,
                delivered_vol_sum: 0,
                kl: 0
            };
        }

        const s = clusters[clusterKey][shop];
        s.vol += row.vol || 0;
        s.vol_tb_ngay_sum += row.vol_tb_ngay || 0;
        s.vol_tb_ngay_count++;
        s.opr_vol_sum += (row.pct_opr || 0) * (row.vol || 0);
        s.rot_lc_vol_sum += ((row.pct_rot_lc || 0) * (row.vol || 0));
        s.odr_vol_sum += ((row.pct_odr || 0) * (row.vol_delivered || 0));
        s.longtail_vol_sum += ((row.pct_longtail || 0) * (row.vol_delivered || 0));
        s.delivered_vol_sum += (row.vol_delivered || 0);
        s.kl += row['kl(kg)'] || 0;
    });

    const recommendations = [];

    Object.entries(clusters).forEach(([clusterKey, shopsMap]) => {
        const [quan, whName] = clusterKey.split(' ||| ');
        
        const candidateShops = Object.values(shopsMap).map(s => {
            const avgVolTbNgay = s.vol_tb_ngay_count > 0 ? (s.vol_tb_ngay_sum / s.vol_tb_ngay_count) : 0;
            const weightedOpr = s.vol > 0 ? (s.opr_vol_sum / s.vol) : 0;
            const weightedRotLc = s.vol > 0 ? (s.rot_lc_vol_sum / s.vol) : 0;
            const weightedOdr = s.delivered_vol_sum > 0 ? (s.odr_vol_sum / s.delivered_vol_sum) : 0;
            const weightedLongtail = s.delivered_vol_sum > 0 ? (s.longtail_vol_sum / s.delivered_vol_sum) : 0;
            return {
                ten_kh: s.ten_kh,
                avg_vol_tb_ngay: avgVolTbNgay,
                weighted_opr: weightedOpr,
                weighted_rot_lc: weightedRotLc,
                weighted_odr: weightedOdr,
                weighted_longtail: weightedLongtail,
                total_vol: s.vol,
                total_delivered_vol: s.delivered_vol_sum,
                total_weight: s.kl
            };
        })
        .filter(s => s.avg_vol_tb_ngay < 1000 && s.total_vol > 0)
        .sort((a, b) => b.avg_vol_tb_ngay - a.avg_vol_tb_ngay)
        .slice(0, 10);

        if (candidateShops.length < 2) return;

        // Size 2 combinations
        for (let i = 0; i < candidateShops.length; i++) {
            for (let j = i + 1; j < candidateShops.length; j++) {
                const s1 = candidateShops[i];
                const s2 = candidateShops[j];
                
                const combinedVol = s1.total_vol + s2.total_vol;
                const combinedDelivered = s1.total_delivered_vol + s2.total_delivered_vol;
                const combinedOpr = combinedVol > 0 ? ((s1.weighted_opr * s1.total_vol) + (s2.weighted_opr * s2.total_vol)) / combinedVol : 0;
                const combinedRotLc = combinedVol > 0 ? ((s1.weighted_rot_lc * s1.total_vol) + (s2.weighted_rot_lc * s2.total_vol)) / combinedVol : 0;
                const combinedOdr = combinedDelivered > 0 ? ((s1.weighted_odr * s1.total_delivered_vol) + (s2.weighted_odr * s2.total_delivered_vol)) / combinedDelivered : 0;
                const combinedLongtail = combinedDelivered > 0 ? ((s1.weighted_longtail * s1.total_delivered_vol) + (s2.weighted_longtail * s2.total_delivered_vol)) / combinedDelivered : 0;
                
                recommendations.push({
                    quan,
                    warehouse_name: whName,
                    shops: [s1, s2],
                    combined_vol_tb_ngay: s1.avg_vol_tb_ngay + s2.avg_vol_tb_ngay,
                    combined_vol: combinedVol,
                    combined_delivered_vol: combinedDelivered,
                    combined_opr: combinedOpr,
                    combined_rot_lc: combinedRotLc,
                    combined_odr: combinedOdr,
                    combined_longtail: combinedLongtail
                });
            }
        }

        // Size 3 combinations
        if (candidateShops.length >= 3) {
            for (let i = 0; i < candidateShops.length; i++) {
                for (let j = i + 1; j < candidateShops.length; j++) {
                    for (let k = j + 1; k < candidateShops.length; k++) {
                        const s1 = candidateShops[i];
                        const s2 = candidateShops[j];
                        const s3 = candidateShops[k];
                        
                        const combinedVol = s1.total_vol + s2.total_vol + s3.total_vol;
                        const combinedDelivered = s1.total_delivered_vol + s2.total_delivered_vol + s3.total_delivered_vol;
                        const combinedOpr = combinedVol > 0 ? 
                            ((s1.weighted_opr * s1.total_vol) + (s2.weighted_opr * s2.total_vol) + (s3.weighted_opr * s3.total_vol)) / combinedVol : 0;
                        const combinedRotLc = combinedVol > 0 ? 
                            ((s1.weighted_rot_lc * s1.total_vol) + (s2.weighted_rot_lc * s2.total_vol) + (s3.weighted_rot_lc * s3.total_vol)) / combinedVol : 0;
                        const combinedOdr = combinedDelivered > 0 ? 
                            ((s1.weighted_odr * s1.total_delivered_vol) + (s2.weighted_odr * s2.total_delivered_vol) + (s3.weighted_odr * s3.total_delivered_vol)) / combinedDelivered : 0;
                        const combinedLongtail = combinedDelivered > 0 ? 
                            ((s1.weighted_longtail * s1.total_delivered_vol) + (s2.weighted_longtail * s2.total_delivered_vol) + (s3.weighted_longtail * s3.total_delivered_vol)) / combinedDelivered : 0;
                        
                        recommendations.push({
                            quan,
                            warehouse_name: whName,
                            shops: [s1, s2, s3],
                            combined_vol_tb_ngay: s1.avg_vol_tb_ngay + s2.avg_vol_tb_ngay + s3.avg_vol_tb_ngay,
                            combined_vol: combinedVol,
                            combined_delivered_vol: combinedDelivered,
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

    recommendations.sort((a, b) => b.combined_vol_tb_ngay - a.combined_vol_tb_ngay);

    // Greedy: each shop appears in AT MOST ONE group
    const usedShopKeys = new Set();
    const uniqueRecs = recommendations.filter(rec => {
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

    const minVol = parseInt(document.getElementById('grouping-min-vol')?.value || 300, 10);
    const groupSize = document.getElementById('grouping-size')?.value || 'all';
    const searchQuery = (document.getElementById('grouping-search')?.value || '').trim().toLowerCase();

    let filteredGroups = groups.filter(g => {
        if (g.combined_vol_tb_ngay < minVol) return false;
        if (groupSize === '2' && g.shops.length !== 2) return false;
        if (groupSize === '3' && g.shops.length !== 3) return false;

        if (searchQuery) {
            const matchHub = g.warehouse_name.toLowerCase().includes(searchQuery);
            const matchQuan = g.quan.toLowerCase().includes(searchQuery);
            if (!matchHub && !matchQuan) return false;
        }
        return true;
    });

    if (filteredGroups.length === 0) {
        table.innerHTML = '<tr><td colspan="13" style="text-align: center; padding: 2rem; color: var(--text-muted);">Không tìm thấy đề xuất gom nhóm nào phù hợp với bộ lọc.</td></tr>';
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
        } else if (g.combined_vol_tb_ngay >= 1000) {
            statusBadge = '<span class="badge" style="background: linear-gradient(135deg, rgba(34, 197, 94, 0.2), rgba(20, 184, 166, 0.2)); color: #4ade80; border: 1px solid rgba(34, 197, 94, 0.3); font-weight: 600;">Siêu Tiềm Năng</span>';
        } else if (g.combined_vol_tb_ngay >= 500) {
            statusBadge = '<span class="badge" style="background: linear-gradient(135deg, rgba(59, 130, 246, 0.2), rgba(56, 189, 248, 0.2)); color: #60a5fa; border: 1px solid rgba(59, 130, 246, 0.3); font-weight: 600;">Khả Thi Cao</span>';
        } else if (g.combined_vol_tb_ngay >= 200) {
            statusBadge = '<span class="badge" style="background: linear-gradient(135deg, rgba(249, 115, 22, 0.2), rgba(234, 179, 8, 0.2)); color: #fb923c; border: 1px solid rgba(249, 115, 22, 0.3); font-weight: 600;">Tiềm Năng</span>';
        } else {
            statusBadge = '<span class="badge" style="background-color: rgba(148, 163, 184, 0.15); color: #94a3b8; border: 1px solid rgba(148, 163, 184, 0.2);">Cần Nuôi Thêm</span>';
        }

        let shopListHtml = '<div style="display: flex; flex-direction: column; gap: 0.4rem; padding: 0.2rem 0;">';
        g.shops.forEach(s => {
            let shopOprColor = s.weighted_opr < 0.9 ? '#f43f5e' : '#14b8a6';
            let shopRotLcColor = s.weighted_rot_lc > 0.02 ? '#f43f5e' : '#14b8a6';
            let shopOdrColor = s.weighted_odr < 0.92 ? '#f43f5e' : '#14b8a6';
            let shopLongtailColor = s.weighted_longtail > 0.08 ? '#f43f5e' : '#14b8a6';
            shopListHtml += `
                <div style="display: flex; align-items: center; justify-content: space-between; gap: 0.5rem; background: rgba(51, 65, 85, 0.4); padding: 0.3rem 0.6rem; border-radius: 6px; border: 1px solid rgba(51, 65, 85, 0.6); white-space: nowrap;">
                    <span style="font-weight: 600; color: #f8fafc; font-size: 0.82rem; max-width: 220px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; flex-grow: 1; text-align: left;" title="${s.ten_kh}">${s.ten_kh}</span>
                    <div style="display: flex; gap: 0.3rem; flex-shrink: 0; align-items: center;">
                        <span class="badge" style="background-color: rgba(59, 130, 246, 0.15); color: #60a5fa; font-family: monospace; font-size: 0.72rem; padding: 0.15rem 0.4rem;">${formatNumber(s.avg_vol_tb_ngay)} đơn</span>
                        <span class="badge" style="background-color: rgba(239, 68, 68, 0.15); color: ${shopRotLcColor}; font-family: monospace; font-size: 0.72rem; padding: 0.15rem 0.4rem;">Rớt: ${formatPercent(s.weighted_rot_lc)}</span>
                        <span class="badge" style="background-color: rgba(20, 184, 166, 0.15); color: ${shopOprColor}; font-family: monospace; font-size: 0.72rem; padding: 0.15rem 0.4rem;">OPR: ${formatPercent(s.weighted_opr)}</span>
                        <span class="badge" style="background-color: rgba(20, 184, 166, 0.15); color: ${shopOdrColor}; font-family: monospace; font-size: 0.72rem; padding: 0.15rem 0.4rem;">ODR: ${formatPercent(s.weighted_odr)}</span>
                        <span class="badge" style="background-color: rgba(249, 115, 22, 0.15); color: ${shopLongtailColor}; font-family: monospace; font-size: 0.72rem; padding: 0.15rem 0.4rem;">LT: ${formatPercent(s.weighted_longtail)}</span>
                    </div>
                </div>
            `;
        });
        shopListHtml += '</div>';

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

        tr.innerHTML = `
            <td style="text-align: center;"><span style="display: inline-block; width: 28px; height: 28px; line-height: 28px; border-radius: 50%; background: ${idx === 0 ? 'rgba(234, 179, 8, 0.2)' : idx === 1 ? 'rgba(148, 163, 184, 0.2)' : 'rgba(115, 115, 115, 0.2)'}; color: ${idx === 0 ? '#facc15' : idx === 1 ? '#cbd5e1' : '#a3a3a3'}; font-weight: bold; font-size: 0.85rem; border: 1px solid ${idx === 0 ? '#facc15' : idx === 1 ? '#cbd5e1' : 'transparent'};">${idx + 1}</span></td>
            <td style="font-weight: 700; color: white;">${g.warehouse_name}</td>
            <td style="color: var(--text-muted); font-weight: 500;">${g.quan}</td>
            <td style="text-align: center;"><span class="badge" style="background-color: ${g.shops.length === 3 ? 'rgba(139, 92, 246, 0.15)' : 'rgba(56, 189, 248, 0.15)'}; color: ${g.shops.length === 3 ? '#a78bfa' : '#38bdf8'}; font-weight: bold;">Gom ${g.shops.length} Shop</span></td>
            <td>${shopListHtml}</td>
            <td style="text-align: right; vertical-align: middle;">${volProgressHtml}</td>
            <td style="text-align: right; vertical-align: middle; font-weight: bold; color: var(--text-main); font-family: monospace; font-size: 0.9rem;">${formatNumber(g.combined_vol)} đơn</td>
            <td style="text-align: center; vertical-align: middle;"><span class="badge" style="background-color: ${rotLcBg}; color: white; font-weight: bold; font-family: monospace; font-size: 0.85rem;">${formatPercent(g.combined_rot_lc)}</span></td>
            <td style="text-align: center; vertical-align: middle;"><span class="badge" style="background-color: ${oprBg}; color: white; font-weight: bold; font-family: monospace; font-size: 0.85rem;">${formatPercent(g.combined_opr)}</span></td>
            <td style="text-align: center; vertical-align: middle;"><span class="badge" style="background-color: ${odrBg}; color: white; font-weight: bold; font-family: monospace; font-size: 0.85rem;">${formatPercent(g.combined_odr)}</span></td>
            <td style="text-align: center; vertical-align: middle;"><span class="badge" style="background-color: ${longtailBg}; color: white; font-weight: bold; font-family: monospace; font-size: 0.85rem;">${formatPercent(g.combined_longtail)}</span></td>
            <td style="text-align: center; vertical-align: middle;">${statusBadge}</td>
        `;
        table.appendChild(tr);
    });
}
