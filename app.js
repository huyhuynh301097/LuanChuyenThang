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
                    pct_opr: row.pct_opr || 0
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
}

// Formatter Helpers
const formatNumber = (num) => new Intl.NumberFormat('vi-VN').format(Math.round(num));
const formatPercent = (num) => (num * 100).toFixed(2) + '%';

// Update Scorecards
function updateScorecards() {
    const totalVol = filteredData.reduce((sum, row) => sum + row.vol, 0);
    const totalWeight = filteredData.reduce((sum, row) => sum + row['kl(kg)'], 0);
    
    // Weighted Average OPR
    let totalOprVol = 0;
    filteredData.forEach(row => {
        totalOprVol += (row.pct_opr * row.vol);
    });
    const avgOpr = totalVol > 0 ? (totalOprVol / totalVol) : 0;
    
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
        scoreTransferDrop.textContent = 'N/A';
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
                    borderColor: 'rgba(239, 68, 68, 1)',
                    backgroundColor: 'rgba(239, 68, 68, 1)',
                    borderWidth: 2,
                    yAxisID: 'y1',
                    tension: 0.3,
                    pointRadius: 4,
                    order: 1,
                    datalabels: {
                        display: true,
                        color: 'rgba(239, 68, 68, 1)',
                        align: 'bottom',
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
                    order: 2,
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
                    title: { display: true, text: 'OPR (%)', color: 'rgba(148, 163, 184, 1)' },
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
                            if (context.datasetIndex === 0) {
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
                                `Bưu Cục: ${shop.warehouse_name || 'Không rõ'}`,
                                `Số ngày >1000 đơn: ${shop.so_ngay_tren_1000_don || 0} ngày`
                            ];
                            lines.push('--- Lịch Sử 3 Tháng ---');
                            history.forEach(h => {
                                lines.push(`Tháng ${h.thang || '?'}: Vol ${Math.round(h.vol_tb_ngay || 0)} | KL ${Math.round(h['kl_tb_ngay(kg)'] || 0)}Kg | OPR ${(h.pct_opr * 100).toFixed(1)}% | Ngày >1000 đơn: ${h.so_ngay_tren_1000_don || 0}`);
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
                backgroundColor: oprs.map(opr => opr < 90 ? 'rgba(239, 68, 68, 0.8)' : 'rgba(168, 85, 247, 0.8)'),
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
                    order: 2,
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
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                x: { grid: { color: 'rgba(51, 65, 85, 0.5)' } },
                y: { type: 'linear', position: 'left', title: { display: true, text: 'Sản Lượng (TB/Ngày)' }, grid: { color: 'rgba(51, 65, 85, 0.5)' } },
                y1: { type: 'linear', position: 'right', title: { display: true, text: 'OPR (%)' }, grid: { drawOnChartArea: false }, min: 0, max: 100 }
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
                            if (context.datasetIndex === 1) { // OPR is index 1
                                label += context.raw.toFixed(1) + '%';
                            } else { // Volume is index 0
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
            <td style="background-color: ${oprBg}; color: white; font-weight: bold">${formatPercent(row.pct_opr)}</td>
        `;
        tbody.appendChild(tr);
    });

    if (tableData.length === 0) {
        tbody.innerHTML = '<tr><td colspan="19" style="text-align: center; padding: 2rem;">Không tìm thấy dữ liệu phù hợp với bộ lọc.</td></tr>';
    }
}

// Generate Alerts
function generateAlerts() {
    const alertsContainer = document.getElementById('alerts-container');
    alertsContainer.innerHTML = '';

    // Calculate OPR by District
    const districtData = {};
    filteredData.forEach(row => {
        const d = row.quan || 'Unknown';
        if (!districtData[d]) districtData[d] = { vol: 0, totalOprVol: 0, vung: row.vung };
        districtData[d].vol += row.vol;
        districtData[d].totalOprVol += (row.pct_opr * row.vol);
    });

    const badDistricts = Object.entries(districtData)
        .map(([name, data]) => ({
            name,
            vung: data.vung,
            vol: data.vol,
            opr: data.vol > 0 ? (data.totalOprVol / data.vol) : 0
        }))
        .filter(d => d.opr > 0 && d.opr < 0.9 && d.vol >= 100) // Alerts for OPR < 90% and volume >= 100
        .sort((a, b) => {
            const riskA = a.vol * (1 - a.opr);
            const riskB = b.vol * (1 - b.opr);
            return riskB - riskA; // High risk first
        });

    if (badDistricts.length > 0) {
        // Only show top 3 alerts to avoid clutter
        badDistricts.slice(0, 3).forEach(d => {
            const alertCard = document.createElement('div');
            alertCard.className = 'alert-card';
            alertCard.innerHTML = `
                <i class='bx bx-error-circle'></i>
                <div class="alert-content">
                    <h4>Cảnh Báo Quận/Huyện: OPR Thấp & Vol Cao tại ${d.name} (${d.vung})</h4>
                    <p>Trung bình OPR chỉ đạt <strong>${(d.opr * 100).toFixed(2)}%</strong> với tổng sản lượng lớn (${formatNumber(d.vol)} đơn). Ảnh hưởng khoảng <strong>${formatNumber(Math.round(d.vol * (1 - d.opr)))}</strong> đơn hàng chậm trễ!</p>
                </div>
            `;
            alertsContainer.appendChild(alertCard);
        });
    }

    // Add Shop Alerts
    const badShops = [...filteredData]
        .filter(d => d.pct_opr > 0 && d.pct_opr < 0.9 && d.vol_tb_ngay >= 10)
        .sort((a, b) => {
            const riskA = a.vol * (1 - a.pct_opr);
            const riskB = b.vol * (1 - b.pct_opr);
            return riskB - riskA; // High risk first
        });

    if (badShops.length > 0) {
        // Show up to 3 worst shops
        badShops.slice(0, 3).forEach(s => {
            const alertCard = document.createElement('div');
            alertCard.className = 'alert-card';
            alertCard.style.borderLeftColor = '#f43f5e';
            alertCard.innerHTML = `
                <i class='bx bx-store-alt' style="color: #f43f5e"></i>
                <div class="alert-content">
                    <h4 style="color: #f43f5e">Cảnh Báo Shop Lớn OPR Thấp: ${s.ten_kh}</h4>
                    <p>OPR rất thấp <strong>${(s.pct_opr * 100).toFixed(1)}%</strong> với sản lượng TB ${formatNumber(s.vol_tb_ngay)} đơn/ngày (Tổng vol: ${formatNumber(s.vol)} đơn) tại BC ${s.warehouse_name}. Số ngày có vol > 1000 đơn: ${s.so_ngay_tren_1000_don || 0} ngày.</p>
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
        if (!regions[r][d]) regions[r][d] = { vol: 0, totalOprVol: 0 };
        regions[r][d].vol += row.vol;
        regions[r][d].totalOprVol += (row.pct_opr * row.vol);
    });

    Object.keys(regions).sort().forEach(r => {
        const districtObj = regions[r];
        const districts = Object.entries(districtObj).map(([name, data]) => ({
            name,
            vol: data.vol,
            opr: data.vol > 0 ? (data.totalOprVol / data.vol) : 0
        })).sort((a, b) => b.vol - a.vol); // Sort by volume descending

        if (districts.length === 0) return;

        const maxVol = Math.max(...districts.map(d => d.vol));

        let html = `<div><h4 style="margin-bottom: 0.5rem; color: var(--accent-blue);">${r}</h4>`;
        html += `<table class="heatmap-table">
            <thead><tr><th>Quận/Huyện</th><th>Tổng Sản Lượng</th><th>OPR Trung Bình</th></tr></thead>
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

            html += `<tr>
                <td>${d.name}</td>
                <td style="background-color: ${volBg};">${formatNumber(d.vol)}</td>
                <td style="background-color: ${oprBg}; color: white;">${formatPercent(d.opr)}</td>
            </tr>`;
        });

        html += `</tbody></table></div>`;
        container.innerHTML += html;
    });
}
