/** @odoo-module **/

import { Component, useState, useRef, onWillStart, onMounted, onWillUnmount } from "@odoo/owl";
import { registry } from "@web/core/registry";
import { useService } from "@web/core/utils/hooks";
import { loadJS } from "@web/core/assets";
import { formatFloat } from "@web/core/utils/numbers";
import { useSaleDashboardFilters, CHANNEL_LABELS } from "./sale_dashboard_filters";

const CHANNEL_COLORS = {
    backend: "#714B67",
    website: "#00A09D",
    pos: "#F0AD4E",
    line_oa: "#06C755",
    shopee: "#FF5722"
};

export class SaleChannelDashboard extends Component {
    static template = "psn_bakesome_backend_sale_reports.Dashboard";

    setup() {
        this.orm = useService("orm");

        const { state, buildDomain, buildGoodsDomain, onDateFieldChange,ready } = useSaleDashboardFilters();
        this.filters = state;
        this.buildDomain = buildDomain;
        this.buildGoodsDomain = buildGoodsDomain;
        this.onDateFieldChange = onDateFieldChange;

        this.trendCanvasRef = useRef("trendCanvas");
        this.pieCanvasRef = useRef("pieCanvas");
        this.branchCanvasRef = useRef("branchCanvas");
        this.customerTrendCanvasRef = useRef("customerTrendCanvas");
        this.gaugeCanvasRef = useRef("gaugeCanvas");
        this.categoryCanvasRef = useRef("categoryCanvas");
        this.charts = {};
        this.state = useState({
            pieMetric: "price_subtotal",
            branchMetric: "price_subtotal",
            categoryMetric: "price_subtotal",
            loading: true,
            refreshing: false,
            error: null,
            kpis: { gross: 0, discount: 0, net: 0, netIncl: 0, qty: 0, orders: 0, avgOrder: 0 },
            channelRows: [],
            trendLabels: [],
            trendSeries: {},
            pieLabels: [],
            pieKeys: [],
            pieData: [],
            branchLabels: [],
            branchData: [],
            customerTrendLabels: [],
            customerTrendData: [],
            customerActivePct: 0,
            categoryPage: 0,
            categoryRows: [],
        });

        onWillStart(async () => {
            await loadJS("/web/static/lib/Chart/Chart.js");
            try {
                await ready
                await this.loadAll();
            } catch (e) {
                console.error(e);
                this.state.error = "Failed to load the dashboard. Please try again.";
            } finally {
                this.state.loading = false;
            }
        });

        onMounted(() => this.renderCharts());

        onWillUnmount(() => {
            Object.values(this.charts).forEach((c) => c?.destroy());
        });
    }

    get domain() {        
        return this.buildDomain();
    }

    // Quantity charts count goods only (no delivery / marketplace fee lines).
    metricDomain(metric) {
        return metric === "product_uom_qty" ? this.buildGoodsDomain() : this.domain;
    }

    get channelLabels() {
        return CHANNEL_LABELS;
    }

    get totalCategoryPages() {
        return Math.ceil(this.state.categoryRows.length / 10) || 1;
    }

    get categoryPagelabel() {
        return `${this.state.categoryPage + 1}/${this.totalCategoryPages}`;
    }


    async onBranchChange(ev) {
        this.filters.branchId = ev.target.value ? parseInt(ev.target.value) : false;
        await this.refresh();
    }

    onDateChange() {
        this.onDateFieldChange(() => this.refresh());
    }

    async onPieMetricChange(ev) {
        this.state.pieMetric = ev.target.value;
        await this.loadPie();
        this.renderPieChart();
    }

    async onBranchMetricChange(ev) {
        this.state.branchMetric = ev.target.value;
        await this.loadBranchChart();
        this.renderBranchChart();
    }

    async onCategoryMetricChange(ev) {
        this.state.categoryMetric = ev.target.value;
        await this.loadCategoryChart();
        this.renderCategoryChart();
    }

    changeCategoryPage(delta) {
        const next = this.state.categoryPage + delta;
        if (next < 0 || next >= this.totalCategoryPages) return;
        this.state.categoryPage = next;
        this.renderCategoryChart();
    }

    toggleCategorypage() {
        const next = this.state.categoryPage + 1;
        this.state.categoryPage = next < this.totalCategoryPages ? next : 0;
        this.renderCategoryChart();
    }

    async refresh() {
        this.state.refreshing = true;
        this.state.error = null;
        try {
            await this.loadAll();
            this.renderCharts();
        } catch (e) {
            console.error(e);
            this.state.error = "Failed to refresh the dashboard. Please try again.";
        } finally {
            this.state.refreshing = false;
        }
    }


    async loadAll() {
        await Promise.all([
            this.loadChannelData(),
            this.loadTrend(),
            this.loadPie(),
            this.loadBranchChart(),
            this.loadCustomerTrend(),
            this.loadCustomerGauge(),
            this.loadCategoryChart(),
        ]);
    }

    async loadChannelData() {
        const [result, goods, sales] = await Promise.all([
            this.orm.readGroup(
                "sale.report",
                this.domain,
                ["price_subtotal:sum", "price_total:sum", "psn_discount_amount:sum"],
                ["channel_type"],
                { lazy: false }
            ),
            this.orm.readGroup("sale.report", this.buildGoodsDomain(), ["product_uom_qty:sum"], ["channel_type"], { lazy: false }),
            // POS refund bills only carry negative quantities, so they drop out here.
            this.orm.readGroup(
                "sale.report",
                [...this.domain, ["product_uom_qty", ">", 0]],
                ["order_reference:count_distinct"],
                ["channel_type"],
                { lazy: false }
            ),
        ]);
        const byChannel = (rows, field) => Object.fromEntries(rows.map((r) => [r.channel_type, r[field] || 0]));
        const qtyByChannel = byChannel(goods, "product_uom_qty");
        const ordersByChannel = byChannel(sales, "order_reference");
        // All money columns except netIncl are untaxed:
        // gross (before discount) = net + discount, net = price_subtotal.
        const rows = result
            .filter((r) => r.channel_type)
            .map((r) => {
                const net = r.price_subtotal || 0;
                const disc = r.psn_discount_amount || 0;
                return {
                    key: r.channel_type,
                    label: CHANNEL_LABELS[r.channel_type] || r.channel_type,
                    gross: net + disc,
                    discount: disc,
                    net,
                    netIncl: r.price_total || 0,
                    qty: qtyByChannel[r.channel_type] || 0,
                    orders: ordersByChannel[r.channel_type] || 0,
                };
            });
        this.state.channelRows = rows;

        const totals = rows.reduce(
            (acc, r) => ({
                gross: acc.gross + r.gross,
                discount: acc.discount + r.discount,
                net: acc.net + r.net,
                netIncl: acc.netIncl + r.netIncl,
                qty: acc.qty + r.qty,
                orders: acc.orders + r.orders,
            }),
            { gross: 0, discount: 0, net: 0, netIncl: 0, qty: 0, orders: 0 }
        );
        this.state.kpis = {
            ...totals,
            avgOrder: totals.orders ? totals.net / totals.orders : 0,
        };
    }

 async loadTrend() {
    // Untaxed, like the KPI cards and the pie/branch/category charts.
    const result = await this.orm.readGroup(
        "sale.report",
        this.domain,
        ["price_subtotal:sum"],
        ["channel_type", "date:month"],
        { lazy: false }
    );
    const monthsSet = new Set();
    const byChannel = { backend: {}, website: {}, pos: {}, line_oa: {}, shopee: {} };
    for (const row of result) {
        const month = row["date:month"];
        const channel = row.channel_type;
        if (!month || !channel) continue;
        monthsSet.add(month);
        byChannel[channel][month] = (byChannel[channel][month] || 0) + (row.price_subtotal || 0);
    }
    const months = Array.from(monthsSet).sort(
        (a, b) => new Date(`1 ${a}`) - new Date(`1 ${b}`)
    );
    this.state.trendLabels = months;
    const series = {};
    for (const ch of Object.keys(byChannel)) {
        series[ch] = months.map((m) => byChannel[ch][m] || 0);
    }
    this.state.trendSeries = series;
}

    async loadPie() {
        const measure = this.state.pieMetric + ":sum";
        const result = await this.orm.readGroup("sale.report", this.metricDomain(this.state.pieMetric), [measure], ["channel_type"], { lazy: false });
        const keys = [];
        const labels = [];
        const data = [];
        for (const row of result) {
            if (!row.channel_type) continue;
            keys.push(row.channel_type);
            labels.push(CHANNEL_LABELS[row.channel_type] || row.channel_type);
            data.push(row[this.state.pieMetric] || 0);
        }
        this.state.pieKeys = keys;
        this.state.pieLabels = labels;
        this.state.pieData = data;
    }

    async loadBranchChart() {
        const measure = this.state.branchMetric + ":sum";
        const result = await this.orm.readGroup("sale.report", this.metricDomain(this.state.branchMetric), [measure], ["branch_id"], { lazy: false });
        const labels = [];
        const data = [];
        for (const row of result) {
            if (!row.branch_id) continue;
            labels.push(row.branch_id[1]);
            data.push(row[this.state.branchMetric] || 0);
        }
        this.state.branchLabels = labels;
        this.state.branchData = data;
    }

 async loadCustomerTrend() {
    const result = await this.orm.readGroup(
        "sale.report",
        this.domain,
        ["partner_id:count_distinct"],
        ["date:month"],
        { lazy: false }
    );
    const rows = result
        .filter((r) => r["date:month"])
        .sort((a, b) => new Date(`1 ${a["date:month"]}`) - new Date(`1 ${b["date:month"]}`));
    this.state.customerTrendLabels = rows.map((r) => r["date:month"]);
    this.state.customerTrendData = rows.map((r) => r.partner_id || 0);
}

    async loadCustomerGauge() {
        const [activeResult, totalCustomers] = await Promise.all([
            this.orm.readGroup("sale.report", this.domain, ["partner_id:count_distinct"], []),
            this.orm.searchCount("res.partner", [["customer_rank", ">", 0]]),
        ]);
        const activeCustomers = activeResult[0]?.partner_id || 0;
        this.state.customerActivePct = totalCustomers ? Math.round((activeCustomers / totalCustomers) * 100) : 0;
    }

    async loadCategoryChart() {
        const measure = this.state.categoryMetric + ":sum";
        const result = await this.orm.readGroup("sale.report", this.metricDomain(this.state.categoryMetric), [measure], ["categ_id"], { lazy: false });
        this.state.categoryRows = result
            .filter((r) => r.categ_id)
            .map((r) => ({ name: r.categ_id[1], value: r[this.state.categoryMetric] || 0 }))
            .sort((a, b) => b.value - a.value);
        if (this.state.categoryPage >= this.totalCategoryPages) {
            this.state.categoryPage = 0;
        }
    }

    renderCharts() {
        this.renderTrendChart();
        this.renderPieChart();
        this.renderBranchChart();
        this.renderCustomerTrendChart();
        this.renderGaugeChart();
        this.renderCategoryChart();
    }

    renderTrendChart() {
        if (!this.trendCanvasRef.el) return;
        const datasets = Object.entries(this.state.trendSeries).map(([key, data]) => ({
            label: CHANNEL_LABELS[key],
            data,
            borderColor: CHANNEL_COLORS[key],
            backgroundColor: CHANNEL_COLORS[key],
            tension: 0.3,
            fill: false,
        }));
        if (this.charts.trend) {
            this.charts.trend.data.labels = this.state.trendLabels;
            this.charts.trend.data.datasets = datasets;
            this.charts.trend.update();
            return;
        }
        this.charts.trend = new Chart(this.trendCanvasRef.el, {
            type: "line",
            data: { labels: this.state.trendLabels, datasets },
            options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: "bottom" } } },
        });
    }

    renderPieChart() {
        if (!this.pieCanvasRef.el) return;
        // Colour by channel key so the pie matches the trend chart.
        const colors = this.state.pieKeys.map((k) => CHANNEL_COLORS[k] || "#999");
        if (this.charts.pie) {
            this.charts.pie.data.labels = this.state.pieLabels;
            this.charts.pie.data.datasets[0].data = this.state.pieData;
            this.charts.pie.data.datasets[0].backgroundColor = colors;
            this.charts.pie.update();
            return;
        }
        this.charts.pie = new Chart(this.pieCanvasRef.el, {
            type: "pie",
            data: { labels: this.state.pieLabels, datasets: [{ data: this.state.pieData, backgroundColor: colors }] },
            options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: "right" } } },
        });
    }

    renderBranchChart() {
        if (!this.branchCanvasRef.el) return;
        const label = this.state.branchMetric === "product_uom_qty" ? "Quantity" : "Revenue";
        if (this.charts.branch) {
            this.charts.branch.data.labels = this.state.branchLabels;
            this.charts.branch.data.datasets[0].data = this.state.branchData;
            this.charts.branch.data.datasets[0].label = label;
            this.charts.branch.update();
            return;
        }
        this.charts.branch = new Chart(this.branchCanvasRef.el, {
            type: "bar",
            data: { labels: this.state.branchLabels, datasets: [{ label, data: this.state.branchData, backgroundColor: "#00A09D" }] },
            options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true } } },
        });
    }

    renderCustomerTrendChart() {
        if (!this.customerTrendCanvasRef.el) return;
        if (this.charts.customerTrend) {
            this.charts.customerTrend.data.labels = this.state.customerTrendLabels;
            this.charts.customerTrend.data.datasets[0].data = this.state.customerTrendData;
            this.charts.customerTrend.update();
            return;
        }
        this.charts.customerTrend = new Chart(this.customerTrendCanvasRef.el, {
            type: "line",
            data: {
                labels: this.state.customerTrendLabels,
                datasets: [{ label: "Active Customers", data: this.state.customerTrendData, borderColor: "#714B67", backgroundColor: "#714B67", tension: 0.3, fill: false }],
            },
            options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true } } },
        });
    }

    renderGaugeChart() {
        if (!this.gaugeCanvasRef.el) return;
        const pct = this.state.customerActivePct;
        if (this.charts.gauge) {
            this.charts.gauge.data.datasets[0].data = [pct, 100 - pct];
            this.charts.gauge.update();
            return;
        }
        this.charts.gauge = new Chart(this.gaugeCanvasRef.el, {
            type: "doughnut",
            data: { labels: ["Active", "Remaining"], datasets: [{ data: [pct, 100 - pct], backgroundColor: ["#06C755", "#e9ecef"], borderWidth: 0 }] },
            options: { circumference: 180, rotation: 270, cutout: "70%", responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false }, tooltip: { enabled: false } } },
        });
    }

    renderCategoryChart() {
        if (!this.categoryCanvasRef.el) return;
        const start = this.state.categoryPage * 10;
        const page = this.state.categoryRows.slice(start, start + 10);
        const label = this.state.categoryMetric === "product_uom_qty" ? "Quantity" : "Revenue";
        if (this.charts.category) {
            this.charts.category.data.labels = page.map((c) => c.name);
            this.charts.category.data.datasets[0].data = page.map((c) => c.value);
            this.charts.category.data.datasets[0].label = label;
            this.charts.category.update();
            return;
        }
        this.charts.category = new Chart(this.categoryCanvasRef.el, {
            type: "bar",
            data: { labels: page.map((c) => c.name), datasets: [{ label, data: page.map((c) => c.value), backgroundColor: "#F0AD4E" }] },
            options: { indexAxis: "y", responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { x: { beginAtZero: true } } },
        });
    }

    formatMoney(value) {
        return formatFloat(value, { digits: [16, 2] });
    }
}

registry.category("actions").add("sale_channel_dashboard", SaleChannelDashboard);
