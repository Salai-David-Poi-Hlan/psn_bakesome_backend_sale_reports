import {Component,onWillStart,onMounted,useState} from "@odoo/owl"
import {registry} from "@web/core/registry"
import {useService} from "@web/core/utils/hooks"
import {loadJS} from "@web/core/assets"
import {formatFloat} from "@web/core/utils/numbers"
import {useSaleDashboardFilters,CHANNEL_LABELS} from './sale_dashboard_filters'
import {usePageRankedChart} from './sale_dashboard_ranked_chart'



export class TopCustomersScreen extends Component{
    static template="psn_bakesome_backend_sale_reports.TopCustomers"


    setup(){
        this.orm=useService("orm")
        const {state,buildDomain,ready,onDateFieldChange}=useSaleDashboardFilters()
        this.filters=state
        this.buildDomain=buildDomain
        this.onDateFieldChange=onDateFieldChange
        this.state=useState({
            sortBy:"price_subtotal",topCustomers:[],
            summary:{
                totalQty:0,totalRevenue:0,totalAverage:0
            }
        })
       
        this.chart=usePageRankedChart()
        this.barCanvasRef=this.chart.genericChart.canvasRef
        onWillStart(async()=>{
            await loadJS("/web/static/lib/Chart/Chart.js")
            await ready
            await this.loadTopCustomers()
        })

        onMounted(async()=>{
                         await this.chart.genericChart.render(this.state.topCustomers, this.metricKey)

        })
    }

    get metricKey(){
        return this.state.sortBy==="product_uom_qty"?"qty":"revenue"
    }

    get channelLabels() {
        return CHANNEL_LABELS;
    }


    async refresh(){
        this.chart.reset()
        await this.loadTopCustomers()
        await this.chart.genericChart.render(this.state.topCustomers,this.metricKey)
    }


    onDateChange(){
         this.onDateFieldChange(()=>this.refresh());
    }
    
    async onBranchChange(ev) {
        this.filters.branchId=ev.target.value ? parseInt(ev.target.value) : false
        await this.refresh()
    }

    async onChannelChange(ev) {
        this.filters.channelType=ev.target.value || false
        await this.refresh()
    }

    async onSortByChange(ev) {
        this.state.sortBy = ev.target.value;
        await this.refresh()
    }


    async toggleChartPage(){
      await this.chart.genericChart.toggle(this.state.topCustomers)
      this.chart.genericChart.render(this.state.topCustomers,this.metricKey)
    }


    get chartPageLabel(){
        return this.chart.pagelabel(this.state.topCustomers)
    }

    async loadTopCustomers(){
        const result=await this.orm.readGroup(
            "sale.report",
            this.buildDomain(),
            ["price_total:sum","product_uom_qty:sum"],
            ["partner_id"],
            {lazy:false}
        )
        const key=this.metricKey
        const rows=result
        .filter((r)=>r.partner_id)
        .map((r)=>({
            id:r.partner_id[0],
            name:r.partner_id[1],
            qty:r.product_uom_qty || 0,
            revenue:r.price_total || 0
        }))
        .sort((a,b)=>{
           
                return b[key] - a[key];
        })
        .slice(0,20)


        this.state.topCustomers=rows


        this.state.summary={
            totalQty:rows.reduce((sum,r)=>sum+r.qty,0),
            totalRevenue:rows.reduce((sum,r)=>sum+r.revenue,0),
            totalAverage:rows.length>0?rows.reduce((sum,r)=>sum+r.revenue,0)/rows.length:0
    }
    }
    formatMoney(value) {
        return formatFloat(value, { digits: [16, 2] });
    }
}

registry.category("actions").add("sale_top_customers", TopCustomersScreen);