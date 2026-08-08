/** @odoo-module **/

import { Component, useState, useRef, onWillStart, onMounted, onWillUnmount } from "@odoo/owl";
import { registry } from "@web/core/registry";
import { useService } from "@web/core/utils/hooks";
import { loadJS } from "@web/core/assets";
import { formatFloat } from "@web/core/utils/numbers";

const CHANNEL_LABELS = {
    backend: "Backend Sale",
    website: "Website",
    pos: "POS",
    line_oa: "Line OA",
};

const CHANNEL_COLORS = {
    backend: "#714B67",
    website: "#00A09D",
    pos: "#F0AD4E",
    line_oa: "#06C755",
};

const DATE_DEBOUNCE_MS = 400;

function today() {
    return new Date().toISOString().slice(0, 10);
}
function firstDayOfMonth() {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10);
}

export class SaleChannelDashboard extends Component {
    static template = "psn_bakesome_backend_sale_reports.Dashboard";

    setup() {
        this.orm = useService("orm");

        this.trendCanvasRef = useRef("trendCanvas");
        this.pieCanvasRef = useRef("pieCanvas");
        this.branchCanvasRef = useRef("branchCanvas");
        this.customerTrendCanvasRef = useRef("customerTrendCanvas");
        this.gaugeCanvasRef = useRef("gaugeCanvas");
        this.categoryCanvasRef = useRef("categoryCanvas");

        // Chart.js instances are kept alive and updated in place instead of
        // being destroyed/recreated on every filter change.
        this.charts = {};
        this._dateChangeTimer = null;

        this.state = useState({
            dateFrom: firstDayOfMonth(),
            dateTo: today(),
            pieMetric: "price_subtotal",
            branchMetric: "price_subtotal",
            categoryMetric: "price_subtotal",
            branchId: false,
            branches: [],

            // `loading` = first paint, blocks with a skeleton.
            // `refreshing` = subsequent loads, just dims the content a bit.
            loading: true,
            refreshing: false,
            error: null,

            kpis: { revenue: 0, qty: 0, orders: 0, avgOrder: 0, discount: 0 },
            channelRows: [],
            trendLabels: [],
            trendSeries: {},
            pieLabels: [],
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
                this.state.branches = await this.orm.searchRead("res.branch", [], ["id", "name"]);
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
            clearTimeout(this._dateChangeTimer);
        });
    }

    get domain() {
        const domain = [
            ["date", ">=", this.state.dateFrom],
            ["date", "<=", this.state.dateTo],
            ["state", "not in", ["draft", "cancel"]],
            ["product_tmpl_id.is_storable", "=", true],
        ];
        if (this.state.branchId) {
            domain.push(["branch_id", "=", this.state.branchId]);
        }
        return domain;
    }

    get totalCategoryPages() {
        return Math.ceil(this.state.categoryRows.length / 10) || 1;
    }

    get categoryPagelabel() {
        return `${this.state.categoryPage + 1}/${this.totalCategoryPages}`;
    }

    // ---- filter handlers -------------------------------------------------

    async onBranchChange(ev) {
        this.state.branchId = ev.target.value ? parseInt(ev.target.value) : false;
        await this.refresh();
    }

    onDateChange() {
        // Debounce so typing/selecting a date doesn't fire several full
        // reloads back to back.
        clearTimeout(this._dateChangeTimer);
        this._dateChangeTimer = setTimeout(() => this.refresh(), DATE_DEBOUNCE_MS);
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

    // ---- data loading ------------------------------------------------

    async loadAll() {
        await Promise.all([
            this.loadChannelData(), // covers KPIs + channel table in one call
            this.loadTrend(),
            this.loadPie(),
            this.loadBranchChart(),
            this.loadCustomerTrend(),
            this.loadCustomerGauge(),
            this.loadCategoryChart(),
        ]);
    }

    // Single readGroup grouped by channel_type. KPIs are derived by summing
    // the per-channel rows client-side, instead of issuing a second,
    // near-duplicate readGroup with no groupby.
    async loadChannelData() {
        const result = await this.orm.readGroup(
            "sale.report",
            this.domain,
            ["price_subtotal:sum", "price_total:sum", "product_uom_qty:sum", "order_reference:count_distinct", "discount:sum"],
            ["channel_type"],
            { lazy: false }
        );

        const rows = result
            .filter((r) => r.channel_type)
            .map((r) => ({
                key: r.channel_type,
                label: CHANNEL_LABELS[r.channel_type] || r.channel_type,
                gross: r.price_total || 0,
                untaxed: r.price_subtotal || 0,
                qty: r.product_uom_qty || 0,
                orders: r.order_reference || 0,
                discount: r.discount || 0,
            }));
        this.state.channelRows = rows;

        const totals = rows.reduce(
            (acc, r) => ({
                revenue: acc.revenue + r.untaxed,
                qty: acc.qty + r.qty,
                orders: acc.orders + r.orders,
                discount: acc.discount + r.discount,
            }),
            { revenue: 0, qty: 0, orders: 0, discount: 0 }
        );
        this.state.kpis = {
            ...totals,
            avgOrder: totals.orders ? totals.revenue / totals.orders : 0,
        };
    }

    async loadTrend() {
        const result = await this.orm.readGroup(
            "sale.report",
            this.domain,
            ["price_subtotal:sum"],
            ["channel_type", "date:month"],
            { lazy: false }
        );
        const monthsSet = new Set();
        const byChannel = { backend: {}, website: {}, pos: {}, line_oa: {} };
        for (const row of result) {
            const month = row["date:month"];
            const channel = row.channel_type;
            if (!month || !channel) continue;
            monthsSet.add(month);
            byChannel[channel][month] = (byChannel[channel][month] || 0) + (row.price_subtotal || 0);
        }
        const months = Array.from(monthsSet).sort();
        this.state.trendLabels = months;
        const series = {};
        for (const ch of Object.keys(byChannel)) {
            series[ch] = months.map((m) => byChannel[ch][m] || 0);
        }
        this.state.trendSeries = series;
    }

    async loadPie() {
        const measure = this.state.pieMetric + ":sum";
        const result = await this.orm.readGroup("sale.report", this.domain, [measure], ["channel_type"], { lazy: false });
        const labels = [];
        const data = [];
        for (const row of result) {
            if (!row.channel_type) continue;
            labels.push(CHANNEL_LABELS[row.channel_type] || row.channel_type);
            data.push(row[this.state.pieMetric] || 0);
        }
        this.state.pieLabels = labels;
        this.state.pieData = data;
    }

    async loadBranchChart() {
        const measure = this.state.branchMetric + ":sum";
        const result = await this.orm.readGroup("sale.report", this.domain, [measure], ["branch_id"], { lazy: false });
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
        const rows = result.filter((r) => r["date:month"]).sort((a, b) => (a["date:month"] > b["date:month"] ? 1 : -1));
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
        const result = await this.orm.readGroup("sale.report", this.domain, [measure], ["categ_id"], { lazy: false });
        this.state.categoryRows = result
            .filter((r) => r.categ_id)
            .map((r) => ({ name: r.categ_id[1], value: r[this.state.categoryMetric] || 0 }))
            .sort((a, b) => b.value - a.value);
        // Clamp page in case the new metric/filter produced fewer pages.
        if (this.state.categoryPage >= this.totalCategoryPages) {
            this.state.categoryPage = 0;
        }
    }

    // ---- rendering ------------------------------------------------
    // Every renderX method updates an existing Chart.js instance in place
    // (data/labels + .update()) instead of destroying and recreating it.
    // This avoids the flash/flicker and is significantly cheaper.

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
        const colors = this.state.pieLabels.map((_, i) => Object.values(CHANNEL_COLORS)[i] || "#999");
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


// /** @odoo-module **/

// import { Component, useState, useRef, onWillStart, onMounted, onWillUnmount } from "@odoo/owl";
// import { registry } from "@web/core/registry";
// import { useService } from "@web/core/utils/hooks";
// import { loadJS } from "@web/core/assets";
// import { formatFloat } from "@web/core/utils/numbers";

// const CHANNEL_LABELS = {
//     backend: "Backend Sale",
//     website: "Website",
//     pos: "POS",
//     line_oa: "Line OA",
// };

// function today() {
//     return new Date().toISOString().slice(0, 10);
// }
// function firstDayOfMonth() {
//     const d = new Date();
//     return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10);
// }

// export class SaleChannelDashboard extends Component {
//     static template = "psn_bakesome_backend_sale_reports.Dashboard";

//     setup() {
//         this.orm = useService("orm");
//         this.trendCanvasRef = useRef("trendCanvas");
//         this.pieCanvasRef = useRef("pieCanvas");
//         this.trendChart = null;
//         this.pieChart = null;
//         this.branchCanvasRef=useRef("branchCanvas")
//         this.customerTrendCanvasRef=useRef("customerTrendCanvas")
//         this.gaugeCanvasRef=useRef("gaugeCanvas")
//         this.categoryCanvasRef=useRef("categoryCanvas")
//         this.branchChart=null
//         this.customerTrendChart=null
//         this.gaugeChart=null
//         this.categoryChart=null

//         this.state = useState({
//             dateFrom: firstDayOfMonth(),
//             dateTo: today(),
//             pieMetric: "price_subtotal", 
//             loading: true,
//             kpis: { revenue: 0, qty: 0, orders: 0, avgOrder: 0,discount:0 },
//             channelRows: [],
//             trendLabels: [],
//             trendSeries: {}, 
//             pieLabels: [],
//             pieData: [],
//             branchId:false,
//             branches:[],
//             branchMetric:"price_subtotal",
//             branchLabels:[],
//             branchData:[],
//             customerTrendLabels:[],
//             customerTrendData:[],
//             customerActivePct:0,
//             categoryMetric:"price_subtotal",
//             categoryPage:0,
//             categoryRows:[]
//         });

//         onWillStart(async () => {
//             await loadJS("/web/static/lib/Chart/Chart.js");
//             this.state.branches=await this.orm.searchRead("res.branch",[],["id","name"])
//             await this.loadAll();
//         });

//         onMounted(() => {
//             this.renderCharts();
//         });

//         onWillUnmount(() => {
//             this.trendChart?.destroy();
//             this.pieChart?.destroy();
//             this.branchChart?.destroy()
//             this.customerTrendChart?.destroy()
//             this.gaugeChart?.destroy()
//             this.categoryChart?.destroy()
//         });
//     }

// get domain() {
//     const domain = [
//         ["date", ">=", this.state.dateFrom],
//         ["date", "<=", this.state.dateTo],
//         ["state", "not in", ["draft", "cancel"]],
//         ["product_tmpl_id.is_storable", "=", true],
//     ];
//     if (this.state.branchId) {
//         domain.push(["branch_id", "=", this.state.branchId]);
//     }
//     return domain;
// }


//     async onBranchChange(ev){
//         this.state.branchId=ev.target.value ? parseInt(ev.target.value) : false
        
//         await this.loadAll()
//         this.renderCharts();
//     }

//     async onDateChange() {
//         await this.loadAll();
//         this.renderCharts();
//     }

//     async onPieMetricChange(ev) {
//         this.state.pieMetric = ev.target.value;
//         await this.loadPie();
//         this.renderPieChart();
//     }

//     get totalCategoryPages(){
//         return Math.ceil(this.state.categoryRows.length/10)||1
//     }

//     get categoryPagelabel(){
//         return `${this.state.categoryPage+1}/${this.totalCategoryPages}`
//     }

//     toggleCategorypage(){
//         const next=this.state.categoryPage+1
//         this.state.categoryPage=next<this.totalCategoryPages?next:0;
//         this.renderCatgoryChart()
//     }

//     async onCategoryMetricChange(ev){
//         this.state.categoryMetric=ev.target.value
//         await this.loadCategoryChart()
//         this.renderCatgoryChart()
//     }

//     async loadAll() {
//         this.state.loading = true;
//         await Promise.all([
//             this.loadKpis(),
//             this.loadChannelTable(),
//             this.loadTrend(),
//             this.loadPie(),
//             this.laodBranchChart(),
//             this.loadCustomerTrend(),
//             this.loadCustomerGauge(),
//             this.loadCategoryChart()
//         ]);
//         this.state.loading = false;
//     }

//     async loadKpis() {
//         const result = await this.orm.readGroup(
//             "sale.report",
//             this.domain,
//             ["price_subtotal:sum", "product_uom_qty:sum", "order_reference:count_distinct","discount:sum"],
//             []
//         );
//         const row = result[0] || {};
//         const revenue = row.price_subtotal || 0;
//         const orders = row.order_reference || 0;
//         this.state.kpis = {
//             revenue,
//             qty: row.product_uom_qty || 0,
//             orders,
//             avgOrder: orders ? revenue / orders : 0,
//             discount:row.discount || 0
//         };
//     }

//     async loadChannelTable() {
//         const result = await this.orm.readGroup(
//             "sale.report",
//             this.domain,
//             ["price_subtotal:sum", "price_total:sum", "product_uom_qty:sum", "order_reference:count_distinct","discount:sum"],
//             ["channel_type"]
//         );
//         this.state.channelRows = result
//             .filter((r) => r.channel_type)
//             .map((r) => ({
//                 key: r.channel_type,
//                 label: CHANNEL_LABELS[r.channel_type] || r.channel_type,
//                 gross: r.price_total || 0,
//                 untaxed: r.price_subtotal || 0,
//                 qty: r.product_uom_qty || 0,
//                 orders: r.order_reference || 0,
//                 discount:r.discount || 0,

//             }));
//     }

//     async loadTrend() {
//         const result = await this.orm.readGroup(
//             "sale.report",
//             this.domain,
//             ["price_subtotal:sum"],
//             ["channel_type", "date:month"],
//             {lazy:false}
//         );
//         const monthsSet = new Set();
//         const byChannel = { backend: {}, website: {}, pos: {}, line_oa: {} };
//         for (const row of result) {
//             const month = row["date:month"];
//             const channel = row.channel_type;
//             if (!month || !channel) continue;
//             monthsSet.add(month);
//             byChannel[channel][month] = (byChannel[channel][month] || 0) + (row.price_subtotal || 0);
//         }
//         const months = Array.from(monthsSet).sort();
//         this.state.trendLabels = months;
//         const series = {};
//         for (const ch of Object.keys(byChannel)) {
//             series[ch] = months.map((m) => byChannel[ch][m] || 0);
//         }
//         this.state.trendSeries = series;
//     }

 

//       async loadPie() {
//         const measure = this.state.pieMetric + ":sum";
//         const result = await this.orm.readGroup(
//             "sale.report",
//             this.domain,
//             [measure],
//             ["channel_type"],
//             {lazy:false}
//         );
//         const labels = [];
//         const data = [];
//         for (const row of result) {
//             if (!row.channel_type) continue
//             labels.push(CHANNEL_LABELS[row.channel_type] || row.channel_type);
//             data.push(row[this.state.pieMetric] || 0)
//         }
//         this.state.pieLabels = labels;
//         this.state.pieData = data;
//     }

//     renderCharts() {
//         this.renderTrendChart();
//         this.renderPieChart();
//         this.renderBranchChart(),
//         this.renderCustomerTrendChart(),
//         this.renderGaugeChart(),
//         this.renderCatgoryChart()
//     }

//     renderTrendChart() {
//         if (!this.trendCanvasRef.el) return;
//         this.trendChart?.destroy();
//         const colors = {
//             backend: "#714B67",
//             website: "#00A09D",
//             pos: "#F0AD4E",
//             line_oa: "#06C755",
//         };
//         const datasets = Object.entries(this.state.trendSeries).map(([key, data]) => ({
//             label: CHANNEL_LABELS[key],
//             data,
//             borderColor: colors[key],
//             backgroundColor: colors[key],
//             tension: 0.3,
//             fill: false,
//         }));
//         this.trendChart = new Chart(this.trendCanvasRef.el, {
//             type: "line",
//             data: { labels: this.state.trendLabels, datasets },
//             options: {
//                 responsive: true,
//                 maintainAspectRatio: false,
//                 plugins: { legend: { position: "bottom" } },
//             },
//         });
//     }

//     renderPieChart() {
//         if (!this.pieCanvasRef.el) return;
//         this.pieChart?.destroy();
//         const channelColors = {
//         backend: "#714B67", website: "#00A09D", pos: "#F0AD4E", line_oa: "#06C755",
//          };
//         this.pieChart = new Chart(this.pieCanvasRef.el, {
//             type: "pie",
//             data: {
//                 labels: this.state.pieLabels,
//                 datasets: [{
//                     data: this.state.pieData,
//                     backgroundColor: this.state.pieLabels.map((_,i)=>
//                        Object.values(channelColors)[i]|| "#999")
//                 }],
//             },
//             options: {
//                 responsive: true,
//                 maintainAspectRatio: false,
//                 plugins: { legend: { position: "right" } },
//             },
//         });
//     }



//     async laodBranchChart(){
//         const measure=this.state.branchMetric+":sum";
//         const result=await this.orm.readGroup(
//             "sale.report",
//             this.domain,
//             [measure],
//             ["branch_id"],
//             {lazy:false}
//         )
//         const labels=[]
//         const data=[]
//         for (const row of result){
//             if (!row.branch_id) continue
//             labels.push(row.branch_id[1])
//             data.push(row[this.state.branchMetric] || 0)
//         }

//         this.state.branchLabels=labels
//         this.state.branchData=data
//     }

//     async onBranchMetricChange(ev){
//         this.state.branchMetric=ev.target.value;
//         await this.laodBranchChart();
//         this.renderBranchChart()

//     }

//     renderBranchChart(){
//         if (!this.branchCanvasRef.el) return
//         this.branchChart?.destroy()
//         this.branchChart=new Chart(this.branchCanvasRef.el,{
//             type:"bar",
//             data:{
//                 labels:this.state.branchLabels,
//                 datasets:[{
//                     label:this.state.branchMetric === "product_uom_qty" ?"Quantity":"Revenue",
//                     data:this.state.branchData,
//                     backgroundColor:"#00A09D"
//                 }]
//             },
//             options:{
//                 responsive:true,
//                 maintainAspectRatio:false,
//                 plugins:{legend:{display:false}},
//                 scales:{y:{beginAtZero:true}}
//             }
//         })
//     }


//     async loadCustomerTrend(){
//         const result=await this.orm.readGroup(
//             "sale.report",
//             this.domain,
//             ["partner_id:count_distinct"],
//             ["date:month"],
//             {lazy:false}
//         )

//         const rows=result
//         .filter((r)=>r["date:month"])
//         .sort((a,b)=>(a["date:month"]>b["date:month"]?1:-1));
//         this.state.customerTrendLabels=rows.map((r)=>r["date:month"])
//         this.state.customerTrendData=rows.map((r)=>r.partner_id || 0)

//     }

//     renderCustomerTrendChart(){
//         if (!this.customerTrendCanvasRef.el) return
//         this.customerTrendChart?.destroy()
//         this.customerTrendChart=new Chart(
//             this.customerTrendCanvasRef.el,{
//                 type:"line",
//                 data:{
//                     labels:this.state.customerTrendLabels,
//                     datasets:[{
//                         label:"Active Customers",
//                         data:this.state.customerTrendData,
//                         borderColor:"#714B67",
//                         backgroundColor:"#714B67",
//                         tension:0.3,
//                         fill:false
//                     }]
//                 },
//                   options:{
//                 responsive:true,
//                 maintainAspectRatio:false,
//                 plugins:{legend:{display:false}},
//                 scales:{y:{beginAtZero:true}}
//             }
//             },
          
//         ) 
//     }

//     async loadCustomerGauge(){
//         const [activeResult,totalCustomers]=await Promise.all([
//             this.orm.readGroup(
//                 "sale.report",
//                 this.domain,
//                 ["partner_id:count_distinct"],
//                 []
//             ),
//             this.orm.searchCount("res.partner",[["customer_rank",">",0]])
//         ]);
//         const activeCustomers=activeResult[0]?.partner_id || 0;
//         this.state.customerActivePct=totalCustomers?Math.round((activeCustomers/totalCustomers)*100):0;
//     }


//     renderGaugeChart(){
//         if (!this.gaugeCanvasRef.el) return 
//         this.gaugeChart?.destroy()
//         const pct=this.state.customerActivePct;
//         this.gaugeChart=new Chart(this.gaugeCanvasRef.el,{
//             type:"doughnut",
//             data:{
//                 labels:["Active","Remaining"],
//                 datasets:[{
//                     data:[pct,100-pct],
//                     backgroundColor:["#06C755","#e9ecef"],
//                     borderWidth:0
//                 }]
//             },
//             options:{
//                 circumference:180,rotation:270,
//                 cutout:"70%",
//                 responsive:true,
//                 maintainAspectRatio:false,
//                 plugins:{
//                     legend:{display:false},tooltip:{enabled:false}
//                 }
//             }
//         })
//     }



//     async loadCategoryChart(){
//         const measure=this.state.categoryMetric+":sum"
//         const result=await this.orm.readGroup(
//               "sale.report",
//                this.domain,
//                [measure],
//                ["categ_id"],
//                {lazy:false}
//         );
//         const rows=result
//         .filter((r)=>r.categ_id)
//         .map((r)=>({
//             name:r.categ_id[1],
//             value:r[this.state.categoryMetric] || 0,
//         }))
//         .sort((a,b)=>b.value-a.value)
//         this.state.categoryRows=rows
//     }


//     renderCatgoryChart(){
//         if (!this.categoryCanvasRef.el) return 
//         this.categoryChart?.destroy()
//         const start=this.state.categoryPage*10;
//         const page=this.state.categoryRows.slice(start,start+10)
//         this.categoryChart=new Chart(this.categoryCanvasRef.el,{
//             type:"bar",
//             data:{
//                 labels:page.map((c)=>c.name),
//                 datasets:[{
//                         label: this.state.categoryMetric === "product_uom_qty" ? "Quantity" : "Revenue",
//                         data:page.map((c)=>c.value),
//                         backgroundColor:"#F0AD4E"
              
//                 }],
              
//             },
//               options:{
//                     indexAxis:"y",
//                     responsive:true,
//                     maintainAspectRatio:false,
//                     plugins:{legend:{display:false}},
//                     scales:{x:{beginAtZero:true}}
//                 }
//         })
//     }

//     formatMoney(value) {
//         return formatFloat(value, { digits: [16, 2] });
//     }
// }

// registry.category("actions").add("sale_channel_dashboard", SaleChannelDashboard);
