/** @odoo-module **/
import {useState,useRef,onMounted,onWillUnmount} from "@odoo/owl"

const PAGE_SIZE=10;

export function usePageRankedChart(){
        const page=useState({value:0,value2:0})
        const canvasRef=useRef("barCanvas");
        const purchasProductscanvasRef=useRef("productsBarCanvas")
        const saleProductscanvasRef=useRef("productsBarCanvas_Sale")
        let chart=null;
        let purchaseProductsChart = null;
        let saleProductsChart=null;
        onWillUnmount(()=>{
            chart?.destroy()
            purchaseProductsChart?.destroy()
            saleProductsChart?.destroy()
        })

        function totalPages(items){
              return Math.ceil(items.length/PAGE_SIZE) || 1;
        }

/////////////////////////
        function pagelabel(items){
            return `${page.value+1}/${totalPages(items)}`
        }


        function pagelabelSale(items){
            return `${page.value+1}/${totalPages(items)}`
        }

        function pagelabelPurchase(items){
            return `${page.value2+1}/${totalPages(items)}`
        }
////////////////////////////////




        function toggle(items){
              const next=page.value+1
              page.value=next<totalPages(items) ? next:0
        }
        function toggleSale(items){
              const next=page.value+1
              page.value=next<totalPages(items) ? next:0
        }
        function togglePurchase(items){
              const next=page.value2+1
              page.value2=next<totalPages(items) ? next:0
        }

////////////////////////////////
        function reset(){
            page.value=0
        }


         function resetSale(){
            page.value=0
        }

         function resetPurchase(){
            page.value2=0
        }


        function renderSaleProducts(items,metricKey){
                if(!saleProductscanvasRef.el) return
                if (page.value >= totalPages(items)) page.value=0
            const start=page.value*PAGE_SIZE
            const pageItems=items.slice(start,start+PAGE_SIZE)
            const purchaseKey=metricKey === "qty"?"purchaseQty":"purchaseRevenue"
            const saleKey = metricKey === "qty" ? "saleQty" : "saleRevenue"


            const data={
                labels:pageItems.map((i)=>i.name),
                datasets:[
                    {
                    label:metricKey==="qty"?"Sale Quantity":"Sale Revenue",
                    data:pageItems.map((i)=>i[saleKey]),
                    backgroundColor:"teal"
                },
                {
                    label:metricKey==="qty"?"Purchase Quantity":"Purchase Revenue",
                    data:pageItems.map((i)=>i[purchaseKey]),
                    backgroundColor:"orange"
                }
                ]
            }

            if(saleProductsChart){
                saleProductsChart.data=data
                saleProductsChart.update()
                return
            }


            saleProductsChart=new Chart(saleProductscanvasRef.el,{
                type:"bar",
                data,
                options:{
                    indexAxis:"y",
                    responsive:true,
                    maintainAspectRatio:false,
                    plugins:{legend:{dis:true}},
                    scales:{x:{beginAtZero:true}}
                }
            })
        }


        function renderpurchasProducts(items,metricKey){            
            if (!purchasProductscanvasRef.el) return
            if (page.value2 >= totalPages(items)) page.value2=0
            const start=page.value2*PAGE_SIZE
            const pageItems=items.slice(start,start+PAGE_SIZE)


            const purchaseKey=metricKey === "qty"?"purchaseQty":"purchaseRevenue"
            const saleKey = metricKey === "qty" ? "saleQty" : "saleRevenue"


            const data={
                labels:pageItems.map((i)=>i.name),
                datasets:[{
                    label:metricKey==="qty"?"Purchase Quantity":"Purchase Revenue",
                    data:pageItems.map((i)=>i[purchaseKey]),
                    backgroundColor:"orange"
                },{
                    label:metricKey==="qty"?"Sale Quantity":"Sale Revenue",
                    data:pageItems.map((i)=>i[saleKey]),
                    backgroundColor:"teal"
                }
            ]
            }

            if (purchaseProductsChart){
                purchaseProductsChart.data=data
                purchaseProductsChart.update()
                return
            } 

            purchaseProductsChart=new Chart(purchasProductscanvasRef.el,{
                type:"bar",
                data,
                options:{
                    indexAxis:"y",
                    responsive:true,
                    maintainAspectRatio:false,
                    plugins:{legend:{display:true}},
                    scales:{x:{beginAtZero:true}}
                }
            })
        }

        function render(items,metricKey){
               if (!canvasRef.el) return;
               if (page.value >= totalPages(items)) page.value = 0;
               const start=page.value*PAGE_SIZE
               const pageItems=items.slice(start,start+PAGE_SIZE)
               const data={
                   labels:pageItems.map((i)=>i.name),
                   datasets:[{
                       label:metricKey==="qty"?"Quantity":"Revenue",
                       data:pageItems.map((i)=>i[metricKey]),
                       backgroundColor:"orange"
                   }]
               }

               if (chart){
                    chart.data=data;
                    chart.update();
                    return;
               }

               chart =new Chart(canvasRef.el,{ 
                   type:"bar",
                   data,
                   options:{
                        indexAxis:"y",
                        responsive:true,
                        maintainAspectRatio:false,
                        plugins:{legend:{display:false}},
                        scales:{x:{beginAtZero:true}}
                   }
               })
        }

     

        return {page,
            totalPages,
            pagelabel,
            pagelabelSale,
            pagelabelPurchase,
            toggle,
            toggleSale,
            togglePurchase,
            reset,
            resetSale,
            resetPurchase,
            render,
            canvasRef,
            purchasProductscanvasRef,
            renderpurchasProducts,
            saleProductscanvasRef,
            renderSaleProducts}
}