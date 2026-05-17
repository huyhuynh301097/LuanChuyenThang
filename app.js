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
            // Process Data: Add custom volume group based on user logic
            rawData = results.data.filter(row => row.warehouse_id != null).map(row => {
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

                return {
                    ...row,
                    nhom_san_luong: nhomSanLuong,
                    hub_type: hubType,
                    // Handle potential NaN values
                    vol: row.vol || 0,
                    'kl(kg)': row['kl(kg)'] || 0,
                    pct_opr: row.pct_opr || 0,
                    pct_rot_lc: row.pct_rot_lc || 0
                };
            });

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
    
    let focusShops = filteredData.filter(d => d.vol_tb_ngay >= 10 && d.pct_opr < 0.9);
    
    if (focusShops.length < 5) {
        focusShops = filteredData.filter(d => d.vol_tb_ngay >= 5 && d.pct_opr < 0.9);
    }
    
    focusShops.sort((a, b) => b.vol_tb_ngay - a.vol_tb_ngay);
    focusShops = focusShops.slice(0, 20);

    const labels = focusShops.map(s => {
        let name = s.ten_kh || s.warehouse_name || 'Unknown';
        return name.length > 20 ? name.substring(0, 20) + '...' : name;
    });
    
    const volData = focusShops.map(s => s.vol_tb_ngay);
    const oprData = focusShops.map(s => s.pct_opr * 100);
    const rotLcData = focusShops.map(s => (s.pct_rot_lc || 0) * 100);

    if (charts.focusShops) charts.focusShops.destroy();

    charts.focusShops = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [
                {
                    type: 'line',
                    label: 'OPR (%)',
                    data: oprData,
                    borderColor: 'rgba(168, 85, 247, 1)', // Purple
                    backgroundColor: 'rgba(168, 85, 247, 1)',
                    borderWidth: 2,
                    yAxisID: 'y1',
                    tension: 0.3,
                    pointRadius: 4,
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
                    borderColor: 'rgba(239, 68, 68, 1)', // Red
                    backgroundColor: 'rgba(239, 68, 68, 1)',
                    borderWidth: 2,
                    yAxisID: 'y1',
                    tension: 0.3,
                    pointRadius: 4,
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
                            if (label) {
                                label += ': ';
                            }
                            if (context.datasetIndex === 0 || context.datasetIndex === 1) { // Line datasets
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
                            const hubName = shop.warehouse_name;
                            
                            // Lục lại rawData để lấy 3 tháng (nhưng chỉ đúng Bưu cục này)
                            const history = rawData
                                .filter(r => r.ten_kh === shopName && r.warehouse_name === hubName)
                                .sort((a, b) => (a.thang || '').localeCompare(b.thang || ''));
                                
                            let lines = [
                                `Khối lượng TB hiện tại: ${Math.round(shop['kl_tb_ngay(kg)'] || 0).toLocaleString()} Kg/Ngày`,
                                `% Rớt LC hiện tại: ${((shop.pct_rot_lc || 0) * 100).toFixed(1)}%`,
                                `Bưu Cục: ${shop.warehouse_name || 'Không rõ'}`,
                                `Số ngày >1000 đơn: ${shop.so_ngay_tren_1000_don || 0} ngày`
                            ];
                            lines.push('--- Lịch Sử 3 Tháng ---');
                            history.forEach(h => {
                                lines.push(`Tháng ${h.thang || '?'}: Vol ${Math.round(h.vol_tb_ngay || 0)} | Rớt LC ${((h.pct_rot_lc || 0) * 100).toFixed(1)}% | OPR ${(h.pct_opr * 100).toFixed(1)}%`);
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
                                `Bưu Cục: ${shop.warehouse_name || 'Không rõ'}`
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
                    order: 3,
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
                            if (context.datasetIndex === 1 || context.datasetIndex === 2) {
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

        if (row.pct_opr < 0.9) {
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
        `;
        tbody.appendChild(tr);
    });

    if (tableData.length === 0) {
        tbody.innerHTML = '<tr><td colspan="20" style="text-align: center; padding: 2rem;">Không tìm thấy dữ liệu phù hợp với bộ lọc.</td></tr>';
    }
}

// Generate Alerts
function generateAlerts() {
    const alertsContainer = document.getElementById('alerts-container');
    alertsContainer.innerHTML = '';

    // Calculate OPR and % Rớt LC by District
    const districtData = {};
    filteredData.forEach(row => {
        const d = row.quan || 'Unknown';
        if (!districtData[d]) districtData[d] = { vol: 0, totalOprVol: 0, totalRotLcVol: 0, vung: row.vung };
        districtData[d].vol += row.vol;
        districtData[d].totalOprVol += (row.pct_opr * row.vol);
        districtData[d].totalRotLcVol += ((row.pct_rot_lc || 0) * row.vol);
    });

    const badDistricts = Object.entries(districtData)
        .map(([name, data]) => ({
            name,
            vung: data.vung,
            vol: data.vol,
            opr: data.vol > 0 ? (data.totalOprVol / data.vol) : 0,
            rotLc: data.vol > 0 ? (data.totalRotLcVol / data.vol) : 0
        }))
        .filter(d => ((d.opr > 0 && d.opr < 0.9) || d.rotLc > 0.02) && d.vol >= 100) // Filter OPR < 90% or Rớt LC > 2%
        .sort((a, b) => {
            const riskA = a.vol * ((1 - a.opr) + a.rotLc);
            const riskB = b.vol * ((1 - b.opr) + b.rotLc);
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
                    <h4>Cảnh Báo Quận/Huyện: Vận Hành Suy Giảm tại ${d.name} (${d.vung})</h4>
                    <p>Trung bình OPR chỉ đạt <strong>${(d.opr * 100).toFixed(2)}%</strong> và Tỷ lệ rớt luân chuyển ở mức <strong style="color: ${d.rotLc > 0.05 ? '#ef4444' : '#f97316'}">${(d.rotLc * 100).toFixed(2)}%</strong> với tổng sản lượng lớn (${formatNumber(d.vol)} đơn). Ảnh hưởng khoảng <strong>${formatNumber(Math.round(d.vol * ((1 - d.opr) + d.rotLc)))}</strong> đơn hàng lỗi/chậm trễ!</p>
                </div>
            `;
            alertsContainer.appendChild(alertCard);
        });
    }

    // Add Shop Alerts
    const badShops = [...filteredData]
        .filter(d => (d.pct_opr > 0 && d.pct_opr < 0.9) || d.pct_rot_lc > 0.02)
        .filter(d => d.vol_tb_ngay >= 10)
        .sort((a, b) => {
            const riskA = a.vol * ((1 - a.pct_opr) + (a.pct_rot_lc || 0));
            const riskB = b.vol * ((1 - b.pct_opr) + (b.pct_rot_lc || 0));
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
            
            if (s.pct_opr < 0.9 && sRotLc > 0.02) {
                shopAlertTitle = `Cảnh Báo Shop OPR Thấp & Rớt LC Cao: ${s.ten_kh}`;
                shopAlertDesc = `Shop đồng thời gặp OPR thấp <strong>${(s.pct_opr * 100).toFixed(1)}%</strong> và Rớt luân chuyển cao <strong>${(sRotLc * 100).toFixed(1)}%</strong> tại BC ${s.warehouse_name}. Sản lượng TB ${formatNumber(s.vol_tb_ngay)} đơn/ngày (Tổng vol: ${formatNumber(s.vol)} đơn).`;
            } else if (sRotLc > 0.02) {
                shopAlertTitle = `Cảnh Báo Shop Rớt LC Cao: ${s.ten_kh}`;
                shopAlertDesc = `Tỷ lệ rớt luân chuyển cao ở mức <strong>${(sRotLc * 100).toFixed(1)}%</strong> tại BC ${s.warehouse_name}. Sản lượng TB ${formatNumber(s.vol_tb_ngay)} đơn/ngày (Tổng vol: ${formatNumber(s.vol)} đơn).`;
            } else {
                shopAlertTitle = `Cảnh Báo Shop OPR Thấp: ${s.ten_kh}`;
                shopAlertDesc = `OPR rất thấp <strong>${(s.pct_opr * 100).toFixed(1)}%</strong> tại BC ${s.warehouse_name}. Sản lượng TB ${formatNumber(s.vol_tb_ngay)} đơn/ngày (Tổng vol: ${formatNumber(s.vol)} đơn). Số ngày có vol > 1000 đơn: ${s.so_ngay_tren_1000_don || 0} ngày.`;
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
        if (!regions[r][d]) regions[r][d] = { vol: 0, totalOprVol: 0, totalRotLcVol: 0 };
        regions[r][d].vol += row.vol;
        regions[r][d].totalOprVol += (row.pct_opr * row.vol);
        regions[r][d].totalRotLcVol += ((row.pct_rot_lc || 0) * row.vol);
    });

    Object.keys(regions).sort().forEach(r => {
        const districtObj = regions[r];
        const districts = Object.entries(districtObj).map(([name, data]) => ({
            name,
            vol: data.vol,
            opr: data.vol > 0 ? (data.totalOprVol / data.vol) : 0,
            rotLc: data.vol > 0 ? (data.totalRotLcVol / data.vol) : 0
        })).sort((a, b) => b.vol - a.vol); // Sort by volume descending

        if (districts.length === 0) return;

        const maxVol = Math.max(...districts.map(d => d.vol));

        let html = `<div><h4 style="margin-bottom: 0.5rem; color: var(--accent-blue);">${r}</h4>`;
        html += `<table class="heatmap-table">
            <thead><tr><th>Quận/Huyện</th><th>Tổng Sản Lượng</th><th>% Rớt LC</th><th>OPR Trung Bình</th></tr></thead>
            <tbody>`;

        districts.forEach(d => {
            // Color for Volume: Light blue to Deep blue
            const volIntensity = maxVol > 0 ? (d.vol / maxVol) : 0;
            const volBg = `rgba(59, 130, 246, ${Math.max(0.1, volIntensity)})`;
            
            // Color for OPR: Red (<90) to Green (>=90)
            let oprBg = '';
            if (d.opr < 0.85) oprBg = '#ef4444'; // Red
            else if (d.opr < 0.90) oprBg = '#f97316'; // Orange
            else if (d.opr < 0.95) oprBg = '#eab308'; // Yellow
            else oprBg = '#22c55e'; // Green

            // Color for Rớt LC: Green (<=2) to Red (>10)
            let rotLcBg = '';
            if (d.rotLc <= 0.02) rotLcBg = '#22c55e';
            else if (d.rotLc <= 0.05) rotLcBg = '#eab308';
            else if (d.rotLc <= 0.10) rotLcBg = '#f97316';
            else rotLcBg = '#ef4444';

            html += `<tr>
                <td>${d.name}</td>
                <td style="background-color: ${volBg};">${formatNumber(d.vol)}</td>
                <td style="background-color: ${rotLcBg}; color: white; font-weight: bold;">${formatPercent(d.rotLc)}</td>
                <td style="background-color: ${oprBg}; color: white; font-weight: bold;">${formatPercent(d.opr)}</td>
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
                kl: 0
            };
        }

        const s = clusters[clusterKey][shop];
        s.vol += row.vol || 0;
        s.vol_tb_ngay_sum += row.vol_tb_ngay || 0;
        s.vol_tb_ngay_count++;
        s.opr_vol_sum += (row.pct_opr || 0) * (row.vol || 0);
        s.rot_lc_vol_sum += ((row.pct_rot_lc || 0) * (row.vol || 0));
        s.kl += row['kl(kg)'] || 0;
    });

    const recommendations = [];

    Object.entries(clusters).forEach(([clusterKey, shopsMap]) => {
        const [quan, whName] = clusterKey.split(' ||| ');
        
        const candidateShops = Object.values(shopsMap).map(s => {
            const avgVolTbNgay = s.vol_tb_ngay_count > 0 ? (s.vol_tb_ngay_sum / s.vol_tb_ngay_count) : 0;
            const weightedOpr = s.vol > 0 ? (s.opr_vol_sum / s.vol) : 0;
            const weightedRotLc = s.vol > 0 ? (s.rot_lc_vol_sum / s.vol) : 0;
            return {
                ten_kh: s.ten_kh,
                avg_vol_tb_ngay: avgVolTbNgay,
                weighted_opr: weightedOpr,
                weighted_rot_lc: weightedRotLc,
                total_vol: s.vol,
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
                const combinedOpr = combinedVol > 0 ? ((s1.weighted_opr * s1.total_vol) + (s2.weighted_opr * s2.total_vol)) / combinedVol : 0;
                const combinedRotLc = combinedVol > 0 ? ((s1.weighted_rot_lc * s1.total_vol) + (s2.weighted_rot_lc * s2.total_vol)) / combinedVol : 0;
                
                recommendations.push({
                    quan,
                    warehouse_name: whName,
                    shops: [s1, s2],
                    combined_vol_tb_ngay: s1.avg_vol_tb_ngay + s2.avg_vol_tb_ngay,
                    combined_vol: combinedVol,
                    combined_opr: combinedOpr,
                    combined_rot_lc: combinedRotLc
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
                        const combinedOpr = combinedVol > 0 ? 
                            ((s1.weighted_opr * s1.total_vol) + (s2.weighted_opr * s2.total_vol) + (s3.weighted_opr * s3.total_vol)) / combinedVol : 0;
                        const combinedRotLc = combinedVol > 0 ? 
                            ((s1.weighted_rot_lc * s1.total_vol) + (s2.weighted_rot_lc * s2.total_vol) + (s3.weighted_rot_lc * s3.total_vol)) / combinedVol : 0;
                        
                        recommendations.push({
                            quan,
                            warehouse_name: whName,
                            shops: [s1, s2, s3],
                            combined_vol_tb_ngay: s1.avg_vol_tb_ngay + s2.avg_vol_tb_ngay + s3.avg_vol_tb_ngay,
                            combined_vol: combinedVol,
                            combined_opr: combinedOpr,
                            combined_rot_lc: combinedRotLc
                        });
                    }
                }
            }
        }
    });

    recommendations.sort((a, b) => b.combined_vol_tb_ngay - a.combined_vol_tb_ngay);
    return recommendations;
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
        table.innerHTML = '<tr><td colspan="10" style="text-align: center; padding: 2rem; color: var(--text-muted);">Không tìm thấy đề xuất gom nhóm nào phù hợp với bộ lọc.</td></tr>';
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

        let statusBadge = '';
        if (g.combined_vol_tb_ngay >= 1000) {
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
            shopListHtml += `
                <div style="display: flex; align-items: center; justify-content: space-between; gap: 0.5rem; background: rgba(51, 65, 85, 0.4); padding: 0.3rem 0.6rem; border-radius: 6px; border: 1px solid rgba(51, 65, 85, 0.6); white-space: nowrap;">
                    <span style="font-weight: 600; color: #f8fafc; font-size: 0.82rem; max-width: 220px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; flex-grow: 1; text-align: left;" title="${s.ten_kh}">${s.ten_kh}</span>
                    <div style="display: flex; gap: 0.3rem; flex-shrink: 0; align-items: center;">
                        <span class="badge" style="background-color: rgba(59, 130, 246, 0.15); color: #60a5fa; font-family: monospace; font-size: 0.72rem; padding: 0.15rem 0.4rem;">${formatNumber(s.avg_vol_tb_ngay)} đơn</span>
                        <span class="badge" style="background-color: rgba(239, 68, 68, 0.15); color: ${shopRotLcColor}; font-family: monospace; font-size: 0.72rem; padding: 0.15rem 0.4rem;">Rớt: ${formatPercent(s.weighted_rot_lc)}</span>
                        <span class="badge" style="background-color: rgba(20, 184, 166, 0.15); color: ${shopOprColor}; font-family: monospace; font-size: 0.72rem; padding: 0.15rem 0.4rem;">OPR: ${formatPercent(s.weighted_opr)}</span>
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
            <td style="text-align: center; vertical-align: middle;">${statusBadge}</td>
        `;
        table.appendChild(tr);
    });
}
