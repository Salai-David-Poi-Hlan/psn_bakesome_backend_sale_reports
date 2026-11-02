/** @odoo-module **/

import {Component,onWillStart,onMounted,useState} from "@odoo/owl"
import {registry} from "@web/core/registry"
import {useService} from "@web/core/utils/hooks";
import {loadJS} from "@web/core/assets"
import {formatFloat} from "@web/core/utils/numbers"
import { useSaleDashboardFilters,CHANNEL_LABELS } from "./sale_dashboard_filters";
import {usePageRankedChart} from './sale_dashboard_ranked_chart'

export class TopProductScreen extends Component{
     
    static template ="psn_bakesome_backend_sale_reports.TopProducts"

    setup(){
       this.orm=useService("orm");
       const {state,buildGoodsDomain,ready,onDateFieldChange}=useSaleDashboardFilters()
       this.filters=state
       this.onDateFieldChange=onDateFieldChange
       this.buildGoodsDomain=buildGoodsDomain
      this.state=useState({
            sortBy:"price_subtotal",
            topProducts:[],
            summary:{
                totalQty:0,totalRevenue:0,totalAverage:0
            }
        })
        this.chart=usePageRankedChart()
       this.barCanvasRef=this.chart.genericChart.canvasRef
  
       onWillStart(async ()=>{
        await loadJS("/web/static/lib/Chart/Chart.js")
        await ready
         await this.loadTopProducts()
       })

       onMounted(async()=>{
          await this.chart.genericChart.render(this.state.topProducts, this.metricKey)
       })
    }

    

    get metricKey() {
        return this.state.sortBy === "product_uom_qty" ? "qty" : "revenue";
    }

    get channelLabels() {
        return CHANNEL_LABELS;
    }

    async refresh() {
        this.chart.genericChart.reset();
        await this.loadTopProducts();
        await this.chart.genericChart.render(this.state.topProducts, this.metricKey);
    }

    onDateChange() {
        this.onDateFieldChange(() => this.refresh());
    }

    async onBranchChange(ev) {
        this.filters.branchId = ev.target.value ? parseInt(ev.target.value) : false;
        await this.refresh();
    }

    async onChannelChange(ev) {
        this.filters.channelType = ev.target.value || false;
        await this.refresh();
    }

    async onSortByChange(ev) {
        this.state.sortBy = ev.target.value;
        await this.refresh();
    }

    async toggleChartPage() {
       await this.chart.genericChart.toggle(this.state.topProducts);
        this.chart.genericChart.render(this.state.topProducts, this.metricKey);
    }

    get chartPageLabel() {
        return this.chart.genericChart.pagelabel(this.state.topProducts);
    }

     async loadTopProducts(){
            
            const result=await this.orm.readGroup(
                "sale.report",
                this.buildGoodsDomain(),
                ["price_subtotal:sum","product_uom_qty:sum"],
                ["product_id"],
                {lazy:false}
            );

            
            const metric=this.state.sortBy;
            const rows=result.filter((r)=>r.product_id)
            .map((r)=>({
                id:r.product_id[0],
                name:r.product_id[1],
                qty:r.product_uom_qty || 0,
                revenue:r.price_subtotal || 0,
                imageUrl: `/web/image/product.product/${r.product_id[0]}/image_128`,
            }))
            .sort((a,b)=>{
                const key=metric==="product_uom_qty" ? "qty":"revenue";
                return b[key]-a[key]
            })
            .slice(0,20);
            this.state.topProducts=rows
        
            
            this.state.summary={
                totalQty:rows.reduce((sum,r)=>sum+r.qty,0),
                totalRevenue:rows.reduce((sum,r)=>sum+r.revenue,0),

            }
       }


       formatMoney(value){
        return formatFloat(value,{digits:[16,2]})
       }

}


registry.category("actions").add("sale_top_products",TopProductScreen)