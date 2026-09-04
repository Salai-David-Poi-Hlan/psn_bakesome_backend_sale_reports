import {useState,onWillStart,onWillUnmount} from '@odoo/owl';
import {useService} from "@web/core/utils/hooks"

export const CHANNEL_LABELS={
    backend:"Backend Sale",
    website:"Website",
    pos:"POS",
    line_oa:"Line OA",
    shopee:"Shopee"
}

const DATE_DEBOUNCE_MS=400;

export function today(){
    return new Date().toISOString().slice(0,10);
}


export function firstDayOfMonth(){
    const d=new Date()
    return new Date(d.getFullYear(),d.getMonth(),1).toISOString().slice(0,10);
}


export function useSaleDashboardFilters(){

    const orm=useService("orm")
    const state=useState({
        dateFrom:firstDayOfMonth(),
        dateTo:today(),
        utcDateFrom:null,
        utcDateTo:null,
        branchId:false,
        channelType:false,
        branches:[]
    });

    let debounceTimer=null;


   const ready = new Promise((resolve,reject) => {
        onWillStart(async () => {
             try {
              state.branches = await orm.searchRead("res.branch", [], ["id","name"]);
              await resolveDateBounds();
              resolve();
          } catch (e) {
              reject(e);
          }
        });
    });

    onWillUnmount(()=>clearTimeout(debounceTimer))

    let requestId=0
    async function resolveDateBounds(){

            
              const id=++requestId;
              const result=await orm.call(
                "sale.report",
                "get_utc_date_bounds",
                [state.dateFrom,state.dateTo]
              )              
              if (id !== requestId) {
                return
              } 
              state.utcDateFrom=result.date_from;
              state.utcDateTo=result.date_to
    }



     function onDateFieldChange(refreshCallback){

        
            clearTimeout(debounceTimer)
            debounceTimer=setTimeout(async()=>{
                await resolveDateBounds();
                await refreshCallback();
            },DATE_DEBOUNCE_MS)            
    }

    function buildDomain(){        
        const domain=[
            ["date",">=",state.utcDateFrom],
            ["date","<",state.utcDateTo],
            ["state","not in",["draft","cancel"]],
            ["product_tmpl_id.is_storable","=",true],
        ];

        if (state.branchId){
            domain.push(["branch_id","=",state.branchId])
        }

        if(state.channelType){
            domain.push(["channel_type","=",state.channelType])
        }


        return domain
    }

     function buildDomainPurchase(){
     
        const domain=[
            ["date_order",">=",state.utcDateFrom],
            ["date_order","<",state.utcDateTo],
            ["state","not in",["draft","cancel"]],
            ["product_tmpl_id.is_storable","=",true],
        ];

        if (state.branchId){
            domain.push(["branch_id","=",state.branchId])
        }
        return domain
    }
  
    


    return {state,buildDomain,buildDomainPurchase,resolveDateBounds,onDateFieldChange,ready}
}