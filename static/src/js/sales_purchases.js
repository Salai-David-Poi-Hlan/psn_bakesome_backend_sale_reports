/** @odoo-module **/
import { Component, onWillStart,useState,onMounted } from "@odoo/owl";
import { registry } from "@web/core/registry";
import { useService } from "@web/core/utils/hooks";
import {loadJS} from "@web/core/assets"
import { formatFloat } from "@web/core/utils/numbers";
import { useSaleDashboardFilters } from "./sale_dashboard_filters";
import {usePageRankedChart} from './sale_dashboard_ranked_chart'



export class SalesPurchasesScreen extends Component {
    static template = "psn_bakesome_backend_sale_reports.SalePurchaseReport";

    setup() {
        this.orm = useService("orm");
        const { state, buildDomain, buildDomainPurchase,ready,onDateFieldChange } = useSaleDashboardFilters();
        this.onDateFieldChange=onDateFieldChange
        this.filters = state;
        this.buildPurchaseDomain = buildDomainPurchase;
        this.buildSaleDomain = buildDomain;
        this.chart=usePageRankedChart()
        this.productsBarCanvas=this.chart.purchaseChart.canvasRef
        this.saleProductsBarCanvas=this.chart.saleChart.canvasRef
        this.vendorCanvas=this.chart.vendorChart.canvasRef
        this.state = useState({
            sortBy: "price_total",
            topVendors: [],
            topProducts: [],
            compareTopProductsSale:[],
            compareTopProductsPurchase:[],
            topSaleProducts:[],
            branch_sale_purchase:[],
            branch_sale_purchase_Summary:[],
            summary: {
                totalQty: 0, totalRevenue: 0, totalSaleRevenue: 0,
                totalAverage: 0, totalUntaxed: 0, totalDiscount: 0,
                totalNet: 0, totalGross: 0, purchaseOrders: 0,
            },
            topSummaryOnPurchase:{
                totalPurchaseQty:0,totalPurchaseRevenue:0,totalSaleQty:0,totalSaleRevenue:0
            },
            topSummaryOnSale:{
                totalPurchaseQty:0,totalPurchaseRevenue:0,totalSaleQty:0,totalSaleRevenue:0

            },

        })
        onWillStart(async () => {
            await loadJS("/web/static/lib/Chart/Chart.js")
            await ready
            await this.loadTopVendorsAndSummary();
            await this.loadTopProducts();
            await this.loadTopSaleProducts();
            await this.laodSaleProducts();
            await this.laodPurchaseProducts()
            await this.loadSaleRevenue();
            await this.loadBranchTrend()
        
        });
        onMounted(async()=>{
            await this.chart.purchaseChart.render(this.state.compareTopProductsSale,this.metricKey)
            await this.chart.saleChart.render(this.state.compareTopProductsPurchase,this.metricKey)
            await this.chart.vendorChart.render(this.state.topVendors,this.metricKey)
            await this.chart.renderBranchTrend(this.state.branch_sale_purchase,this.metricKey)
        })
    }

    async toggleChartPage(){
        await this.chart.purchaseChart.toggle(this.state.compareTopProductsSale,this.metricKey)
        this.chart.purchaseChart.render(this.state.compareTopProductsSale,this.metricKey)
        
    }

    async toggleChartPageSale(){
        await  this.chart.saleChart.toggle(this.state.compareTopProductsPurchase,this.metricKey)
        this.chart.saleChart.render(this.state.compareTopProductsPurchase,this.metricKey)
    }

    async toggleChartPageVendor(){
        await this.chart.vendorChart.toggle(this.state.topVendors,this.metricKey)
         this.chart.vendorChart.render(this.state.topVendors,this.metricKey)
    }

    get metricKey(){
        return this.state.sortBy === "qty" ? "qty" : "revenue";
    }


    get chartPageLabelSale(){
        return this.chart.saleChart.pagelabel(this.state.compareTopProductsPurchase)
    }

    get chartPageLabel(){
        return this.chart.purchaseChart.pagelabel(this.state.compareTopProductsSale)
    }


    get chartPageVendor(){
        return this.chart.vendorChart.pagelabel(this.state.topVendors)
    }

    async refresh() {
        this.chart.purchaseChart.reset();
        this.chart.saleChart.reset();
        await this.loadTopVendorsAndSummary();
        await this.loadTopProducts();
        await this.loadTopSaleProducts();
        await this.laodSaleProducts();
        await this.laodPurchaseProducts()
        await this.loadSaleRevenue()
        await this.loadBranchTrend()
        await this.chart.purchaseChart.render(this.state.compareTopProductsSale,this.metricKey)
        await this.chart.saleChart.render(this.state.compareTopProductsPurchase,this.metricKey)
        await this.chart.vendorChart.render(this.state.topVendors,this.metricKey)
        await this.chart.renderBranchTrend(this.state.branch_sale_purchase,this.metricKey)

    }

    onDateChange() {
        this.onDateFieldChange(() => this.refresh());
    }

    async onBranchChange(ev) {
        this.filters.branchId = ev.target.value ? parseInt(ev.target.value) : false;
        await this.refresh();
    }

    async onSortByChange(ev) {
        this.state.sortBy = ev.target.value;
        await this.refresh()
    }

    async loadTopVendorsAndSummary() {

        const result = await this.orm.readGroup(
            "purchase.report",
            this.buildPurchaseDomain(),
            ["price_total:sum", "qty_ordered:sum", "untaxed_total:sum", "psn_discount_amount:sum", "order_id:count_distinct"],
            ["partner_id"],
            { lazy: false }
        );

        const rows = result
            .filter((r) => r.partner_id)
            .map((r) => ({
                id: r.partner_id[0],
                name: r.partner_id[1],
                totalQty: r.qty_ordered || 0,
                // totalRevenue is incl. VAT; gross/discount/net are untaxed.
                totalRevenue: r.price_total || 0,
                totalUntaxed: r.untaxed_total || 0,
                totalDiscount: r.psn_discount_amount || 0,
                totalGross: (r.untaxed_total || 0) + (r.psn_discount_amount || 0),
                totalNet: r.untaxed_total || 0,
                total_orders: r.order_id || 0,
                totalAverage: r.order_id ? (r.untaxed_total || 0) / r.order_id : 0,
            }));

        const metric = this.state.sortBy;
        const key = metric === "price_total" ? "totalRevenue" : "totalQty";
        this.state.topVendors = [...rows].sort((a, b) => b[key] - a[key]).slice(0, 20);

        this.state.summary = {
            ...this.state.summary,
            totalQty: rows.reduce((sum, r) => sum + r.totalQty, 0),
            totalRevenue: rows.reduce((sum, r) => sum + r.totalRevenue, 0),
            totalUntaxed: rows.reduce((sum, r) => sum + r.totalUntaxed, 0),
            totalDiscount: rows.reduce((sum, r) => sum + r.totalDiscount, 0),
            totalGross: rows.reduce((sum, r) => sum + r.totalGross, 0),
            totalNet: rows.reduce((sum, r) => sum + r.totalNet, 0),
            purchaseOrders: rows.reduce((sum, r) => sum + r.total_orders, 0),
        };
        const s = this.state.summary;
        s.totalAverage = s.purchaseOrders ? s.totalNet / s.purchaseOrders : 0;


        
    }

    async laodSaleProducts(){

        if(!this.state.topProducts.length){
            this.state.compareTopProductsSale=[];
            return
        }
        const productIds=this.state.topProducts.map((p)=>p.id)
        const domain=[...this.buildSaleDomain(),["product_id","in",productIds]]
          const result=await this.orm.readGroup(
            "sale.report",
            domain,
            ["price_total:sum","product_uom_qty:sum"],
            ["product_id"],
            {lazy:false}
          )

          
   
          const saleByProductId=new Map(
            result
            .filter((r)=>r.product_id)
            .map((r)=>[
                r.product_id[0],
                {
                    saleQty:r.product_uom_qty || 0,
                    saleRevenue:r.price_total || 0
                }
            ])
          )

          this.state.compareTopProductsSale = this.state.topProducts.map((p) => ({
           id: p.id,
           name: p.name,
           purchaseQty: p.qty,
           purchaseRevenue: p.revenue,
           saleQty: saleByProductId.get(p.id)?.saleQty || 0,
           saleRevenue: saleByProductId.get(p.id)?.saleRevenue || 0,
    }))
    
    
    
     this.state.topSummaryOnPurchase={
        ...this.state.topSummaryOnPurchase,
             totalPurchaseQty:this.state.compareTopProductsSale.reduce((sum,r)=>sum+r.purchaseQty,0),
             totalPurchaseRevenue:this.state.compareTopProductsSale.reduce((sum,r)=>sum+r.purchaseRevenue,0),
             totalSaleQty:this.state.compareTopProductsSale.reduce((sum,r)=>sum+r.saleQty,0),
             totalSaleRevenue:this.state.compareTopProductsSale.reduce((sum,r)=>sum+r.saleRevenue,0)
     }
     
    }

    async loadSaleRevenue() {
        const result = await this.orm.readGroup(
            "sale.report",
            this.buildSaleDomain(),
            ["price_subtotal:sum"],
            [],
            { lazy: false }
        );
        // Untaxed, to compare with Net Purchases (untaxed).
        const totalSaleRevenue = result.reduce((sum, r) => sum + (r.price_subtotal || 0), 0);
        this.state.summary = { ...this.state.summary, totalSaleRevenue };
    }

    async loadTopProducts() {

        
        const result = await this.orm.readGroup(
            "purchase.report",
            this.buildPurchaseDomain(),
            ["price_total:sum", "qty_ordered:sum", "psn_discount_amount:sum", "order_id:count_distinct"],
            ["product_id"],
            { lazy: false }
        );
        

        const metric = this.state.sortBy;
        const key = metric === "price_total" ? "revenue" : "qty";
        this.state.topProducts = result
            .filter((r) => r.product_id)
            .map((r) => ({
                id: r.product_id[0],
                name: r.product_id[1],
                qty: r.qty_ordered || 0,
                revenue: r.price_total || 0,
                discount: r.psn_discount_amount || 0,
                orders: r.order_id || 0,
                imageUrl: `/web/image/product.product/${r.product_id[0]}/image_128`,
            }))
            .sort((a, b) => b[key] - a[key])
            .slice(0, 20);
           console.log("Top Purchase Products: "+this.state.topProducts.reduce((sum,r)=>sum+r.revenue,0));
            console.log("Top Purchase Products: "+this.state.topProducts.reduce((sum,r)=>sum+r.qty,0));

           
            }




    async loadTopSaleProducts(){
        
        const result=await this.orm.readGroup(
            "sale.report",
            this.buildSaleDomain(),
            ["price_total:sum","product_uom_qty:sum"],
            ["product_id"],
            {lazy:false}
        )
        const metric = this.state.sortBy;
        const key = metric === "price_total" ? "revenue" : "qty";

        this.state.topSaleProducts=result
        .filter((r)=>r.product_id)
        .map((r)=>({
            id:r.product_id[0],
            name:r.product_id[1],
            qty:r.product_uom_qty || 0,
            revenue:r.price_total || 0
        })).sort((a,b)=>b[key]-a[key])
        .slice(0,20)  
    }



    async laodPurchaseProducts(){
 
        if(!this.state.topSaleProducts.length){
           this.state.compareTopProductsPurchase=[]
           return
        }
        const productIds=this.state.topSaleProducts.map((r)=>r.id)
        const domain=[...this.buildPurchaseDomain(),["product_id","in",productIds]]
        const result=await this.orm.readGroup(
            "purchase.report",
            domain,
            ["price_total:sum","qty_ordered:sum"],
            ["product_id"],
            {lazy:false}
        )

        
        const purchaseByProductId=new Map(
            result
            .filter((r)=>r.product_id)
            .map((r)=>[
                r.product_id[0],
                {
                    purchaseQty:r.qty_ordered || 0,
                    purchaseRevenue:r.price_total || 0
                }
            ])
        )

        
        
        this.state.compareTopProductsPurchase=this.state.topSaleProducts.map((p)=>({
            id:p.id,
            name:p.name,
            saleQty:p.qty,
            saleRevenue:p.revenue,
            purchaseQty:purchaseByProductId.get(p.id)?.purchaseQty || 0,
            purchaseRevenue:purchaseByProductId.get(p.id)?.purchaseRevenue || 0
        }))
        
            this.state.topSummaryOnSale={
                ...this.state.topSummaryOnSale,
                totalPurchaseQty:this.state.compareTopProductsPurchase.reduce((sum,r)=>sum+r.purchaseQty,0),
                totalPurchaseRevenue:this.state.compareTopProductsPurchase.reduce((sum,r)=>sum+r.purchaseRevenue,0),
                totalSaleQty:this.state.compareTopProductsPurchase.reduce((sum,r)=>sum+r.saleQty,0),
                totalSaleRevenue:this.state.compareTopProductsPurchase.reduce((sum,r)=>sum+r.saleRevenue,0)
            }            
    }

    async loadSaleBranch(){
              const sale_result=await this.orm.readGroup("sale.report",
                   this.buildSaleDomain(),
                   ["price_total:sum","product_uom_qty:sum"],
                   ["branch_id","date:month"],
                   {lazy:false}
              )

              const saleByBranchMonth=new Map()
              for(const r of sale_result){
                if(!r.branch_id) continue
                const branchId=r.branch_id[0]
                const branchName=r.branch_id[1]
                const key=`${branchId}::${r["date:month"]}`
                saleByBranchMonth.set(key,{
                    branchName,
                    saleRevenue:r.price_total || 0,
                    saleQty:r.product_uom_qty || 0,
                })
              }              
              return saleByBranchMonth
            
    }

    async loadPurchaseBranch(){
        const purchase_result=await this.orm.readGroup("purchase.report",
             this.buildPurchaseDomain(),
             ["price_total:sum","qty_ordered:sum"],
             ["branch_id","date_order:month"],
             {lazy:false}
        )

        const purchaseByBranchMonth=new Map()
        for(const r of purchase_result){
            if(!r.branch_id) continue
            const branchId=r.branch_id[0]
            const branchName=r.branch_id[1]
            const key=`${branchId}::${r["date_order:month"]}`
            purchaseByBranchMonth.set(key,{
                branchName,
                purchaseRevenue:r.price_total || 0,
                purchaseQty:r.qty_ordered || 0,
            })
         
        }
             return purchaseByBranchMonth
    }



    async loadBranchTrend(){
        const saleMap=await this.loadSaleBranch()
        const purchaseMap=await this.loadPurchaseBranch()

        const branchNameById=new Map()
        const months=new Set()

      for(const [key,value] of [...saleMap.entries(),...purchaseMap.entries()]){
          const [branchId,month]=key.split("::")
          months.add(month)
          if(!branchNameById.has(branchId)){
            branchNameById.set(branchId,value.branchName)
          }
      }
      const sortedMonths=[...months].sort((a,b)=>new Date(`1 ${a}`)-new Date(`1 ${b}`))
      

      this.state.branch_sale_purchase={
        months:sortedMonths,
        branches:[...branchNameById.entries()].map(([id,name])=>({
            id:Number(id),
            name,
            saleRevenue:sortedMonths.map((m)=>saleMap.get(`${id}::${m}`)?.saleRevenue || 0),
            saleQty:sortedMonths.map((m)=>saleMap.get(`${id}::${m}`)?.saleQty || 0),
            purchaseRevenue:sortedMonths.map((m)=>purchaseMap.get(`${id}::${m}`)?.purchaseRevenue || 0),
            purchaseQty:sortedMonths.map((m)=>purchaseMap.get(`${id}::${m}`)?.purchaseQty || 0)
        }))
      }


      this.state.branch_sale_purchase_Summary={
        ...this.state.branch_sale_purchase_Summary,
        totalSaleRevenue:this.state.branch_sale_purchase.branches.reduce((sum,r)=>sum+r.saleRevenue,0),
        totalSaleQty:this.state.branch_sale_purchase.branches.reduce((sum,r)=>sum+r.saleQty,0),
        totalpurchaseRevenue:this.state.branch_sale_purchase.branches.reduce((sum,r)=>sum+r.purchaseRevenue,0),
        totalpurchaseQty:this.state.branch_sale_purchase.branches.reduce((sum,r)=>sum+r.purchaseQty,0)
      }


      console.log(this.state.branch_sale_purchase_Summary);
      
    }

    formatMoney(value) {
        return formatFloat(value, { digits: [16, 2] });
    }
}

registry.category("actions").add("sale_purchase", SalesPurchasesScreen);