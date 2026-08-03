import {useState} from '@odoo/owl';


export const CHANNEL_LABELS={
    backend:"Backend Sale",
    website:"Website",
    pos:"POS",
    line_oa:"Line OA"
}


export function today(){
    return new Date().toISOString().slice(0,10);
}


export function firstDayOfMonth(){
    const d=new Date()
    return new Date(d.getFullYear(),d.getMonth(),1).toISOString().slice(0,10);
}


export function useSaleDashboardFilters(){
    const state=useState({
        dateFrom:firstDayOfMonth(),
        dateTo:today(),
        branchId:false,
        channelType:false,
        branches:[]
    })


    function buildDomain(){
        const domain=[
            ["date",">=",state.dateFrom],
            ["date","<=",state.dateTo],
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



    return {state,buildDomain}
}