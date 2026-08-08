/**@odoo-module **/

import {Component,useState} from "@odoo/owl"
import {registry} from "@web/core/registry"

import {SaleChannelDashboard} from'./channel_dashboard'
import {TopCustomersScreen} from'./top_customers'
import {TopProductScreen} from'./top_products'

const MENU_ITEMS=[
    {id:"dashboard",label:"Sale Channels Dashboard",icon:"fa-th-large"},
    {id:"products",label:"Top Products",icon:"fa-cubes"},
    {id:"customers",label:"Top Customers",icon:"fa-users"},
]


export class SaleAnalyticsReports extends Component{
    static template="psn_bakesome_backend_sale_reports.SaleAnalyticsReports"
    static components={SaleChannelDashboard,TopCustomersScreen,TopProductScreen}
    setup(){
        this.state=useState({
            activeView:"dashboard",
            menuOpen:false,

        })
        this.menuItems=MENU_ITEMS
    }
     toggleMenu(){
        this.state.menuOpen=!this.state.menuOpen
     }



     closeMenu(){
        this.state.menuOpen=false
     }


     selectView(viewId){
       this.state.activeView=viewId
       this.state.menuOpen=false
     }
}


registry.category("actions").add("sale_analytics_reports",SaleAnalyticsReports)