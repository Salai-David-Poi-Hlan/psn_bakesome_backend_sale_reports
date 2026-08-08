/**@odoo-module**/
import {Component,useState,useRef,onWillStart,onMounted,onWillUnmount} from '@odoo/owl';
import {registry} from '@web/core/registry';
import {useService} from "@web/core/utils/hooks";
import {loadJS} from "@web/core/assets";
import {formatFloat} from "@web/core/utils/numbers"



const DATE_DEBOUNCE_MS=400



function today(){
    return new Date().toISOString().slice(0,10)
}

function firstDayOfMonth(){
    const d=new Date()
    return new Date(d.getFullYear,d.getMonth(),1).toISOString().slice(0,10)
}



async function getBranches(){
    branches=await useService("orm").searchRead("res.branch",[],["id","name"])
    return branches
}


export class Sales_Purchases extends Component{
    static template="psn_bakesome_backend_sale_reports"

    setup(){
        this.orm=useService("orm")
        this.trendCanvasRef=useRef("trendCanvas")
        this.pieCanvasRef=useRef("pieCanvas")
        this.charts={}
        this._dateChangeTimer=null
        this.branch=[]

        this.state=useState({
            dateFrom:firstDayOfMonth(),
            dateTo:today(),
            pieMetric:"price_subtotal",
            graphMetric:"price_subtotal",
            loading:true,
            refreshing:false,
            error:null,
            kpis:{
               p_revenue:0,p_qty:0,purchases:0,avgPurchase:0,discount:0,profit_loss:0
            },
        })


        onWillStart(async()=>{
            await loadJS("/web/static/lib/Chart/Chart.js")
            try{
                await this.loadAll()
            }catch(e){
                console.error(e)
                this.state.error="Falied to load the dashboard. Please try again"
            }finally{
                this.state.loading=false

            }
        })
     
    }
            get domain(){
    const domain=[
        ["date",">=",this.state.dateFrom],
        ["date","<=",this.state.dateTo],
        ["state","not in",["draft","cancel"]],
        ["product_tmpl_id.is_storable","=",true]
    ]
    return domain
}


}