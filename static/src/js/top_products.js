/** @odoo-module **/

import {Component,onWillStart,useRef,onMounted,onWillUnmount} from "@odoo/owl"
import {registry} from "@web/core/registry"
import {useService} from "@web/core/utils/hooks";
import {loadJS} from "@web/core/assets"
import {formatFloat} from "@web/core/utils/numbers"
import { useSaleDashboardFilters,CHANNEL_LABELS } from "./sale_dashboard_filters";


export class TopProductScreen extends Component{
     
    static template ="psn_bakesome_backend_sale_reports.TopProducts"

    setup(){
       this.orm=useService("orm");
       const {state,buildDomain}=useSaleDashboardFilters()
       this.state=state
       this.buildDomain=buildDomain
       this.state.sortBy="price_subtotal";
       this.state.topProducts=[]
       this.state.summary={totalQty:0,totalRevenue:0}
       this.state.chartPage=0
       this.barCanvasRef=useRef("barCanvas")
       this.barChart=null
  
       onWillStart(async ()=>{
        await loadJS("/web/static/lib/Chart/Chart.js")
        this.state.branches=await this.orm.searchRead("res.branch",[],["id","name"])
         await this.loadTopProducts()
       })

       onMounted(()=>{
        this.renderBarChart()
       })

       onWillUnmount(()=>{
        this.barChart?.destroy()
       })
    }

    get totalChartPages(){
        return Math.ceil(this.state.topProducts.length/10) || 1
    }


    get chartPageLabel(){
        return `${this.state.chartPage +1}/${this.totalChartPages}`
    }


    toggleChartPage(){
        const next=this.state.chartPage+1;
        this.state.chartPage=next <this.totalChartPages?next:0;
        this.renderBarChart()
    }

    async onFilterChange(){
        this.state.chartPage=0
        await this.loadTopProducts()
        this.renderBarChart()
    }
    async onBranchChange(ev){
        this.state.chartPage=0
        this.state.branchId=ev.target.value ? parseInt(ev.target.value) : false
        await this.loadTopProducts()
        this.renderBarChart()
    }


    async onChannelChange(ev){
        this.state.chartPage=0
        this.state.channelType=ev.target.value  || false
        await this.loadTopProducts()
        this.renderBarChart()
    }


    async onSortByChange(ev){
        this.state.chartPage=0
        this.state.sortBy=ev.target.value
        await this.loadTopProducts()
        this.renderBarChart()
    }

     async loadTopProducts(){
            const result=await this.orm.readGroup(
                "sale.report",
                this.buildDomain(),
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
                totalRevenue:rows.reduce((sum,r)=>sum+r.revenue,0)
            }
       }



       renderBarChart(){
          if (!this.barCanvasRef.el) return 
          this.barChart?.destroy()

          const metric=this.state.sortBy
          const key=metric==='product_uom_qty'?"qty":"revenue"
          const start=this.state.chartPage *10;
          const pageProducts=this.state.topProducts.slice(start,start+10)
      

          this.barChart=new Chart(this.barCanvasRef.el,{
            type:"bar",
            data:{
                labels:pageProducts.map((p)=>p.name),
                datasets:[{
                    label:key==="qty"?"Quantity":"Revenue",
                    data:pageProducts.map((p)=>p[key]),
                    backgroundColor: "orange",
                }],
            },
            options:{
                indexAxis:"y",
                responsive:true,
                maintainAspectRatio:false,
                plugins:{legend:{display:false}},
                scales:{x:{beginAtZero:true}}
            }
          })
       }


       formatMoney(value){
        return formatFloat(value,{digits:[16,2]})
       }


       get channelLabels(){
        return CHANNEL_LABELS
       }
}


registry.category("actions").add("sale_top_products",TopProductScreen)