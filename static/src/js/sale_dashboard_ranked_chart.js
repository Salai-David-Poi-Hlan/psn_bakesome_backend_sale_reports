/** @odoo-module **/
import {useState,useRef,onWillUnmount} from "@odoo/owl"

const PAGE_SIZE=10;

function createPageBarChart(canvasRef,{buildDataSets,indexAxis="y",legend=true}){
    const page=useState({value:0})
    let chartInstance=null;


    function totalPages(items){
        return Math.ceil(items.length/PAGE_SIZE) || 1
    }

    function pagelabel(items){
            return `${page.value+1}/${totalPages(items)}`
    }

    function toggle(items){
        const next=page.value+1
        page.value=next<totalPages(items) ? next:0
    }

    function reset(){
        page.value=0
    }

    
}



export function usePageRankedChart(){
        const page=useState({value:0,value2:0,vendor_Value:0})
        const canvasRef=useRef("barCanvas");
        const purchasProductscanvasRef=useRef("productsBarCanvas")
        const saleProductscanvasRef=useRef("productsBarCanvas_Sale")
        const vendorCanvasRef=useRef("vendorCanvas")
        const branchCanvasRef=useRef("branchCanvas")
        let chart=null;
        let purchaseProductsChart = null;
        let saleProductsChart=null;
        let vendorChart=null;
        let branchChart=null;
        onWillUnmount(()=>{
            chart?.destroy()
            purchaseProductsChart?.destroy()
            saleProductsChart?.destroy()
            vendorChart?.destroy()
            branchChart?.destroy()
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

        function vendorLabel(items){
            return  `${page.vendor_Value+1}/${totalPages(items)}`
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

        function toggleVendor(items){
            const next=page.vendor_Value+1
            page.vendor_Value=next<totalPages(items)?next:0
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


        function resetVendor(){
            page.vendor_Value=0
        }
////////////////////////////////

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
                    plugins:{legend:{display:true}},
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



        function renderVendorSupplier(items,metricKey){
            if (!vendorCanvasRef.el) return;
            if(page.vendor_Value>=totalPages(items)) page.vendor_Value=0
            const start=page.vendor_Value*PAGE_SIZE
            const pageItems=items.slice(start,start+PAGE_SIZE)
            const key = metricKey === "qty" ? "totalQty" : "totalRevenue"
            const data={
                labels:pageItems.map((i)=>i.name),
                datasets:[{
                    label:metricKey==="qty"?"Quantity":"Revenue",
                    data: pageItems.map((i) => i[key]),                    
                    backgroundColor:"orange"
                }]
            }


            if(vendorChart){
                vendorChart.data=data
                vendorChart.update()
                return
            }


            vendorChart=new Chart(vendorCanvasRef.el,{
                type:"bar",
                data,
                options:{
                    indexAxis:"x",
                    responsive:true,
                    maintainAspectRatio:false, 
                    plugins:{legend:{display:false}},
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


        function renderBranchTrend(data,metricKey){
           if (!branchCanvasRef.el) return
               const revenueOrQty=metricKey==="qty"?"Qty":"Revenue"
               const saleField=`sale${revenueOrQty}`
               const purchaseField=`purchase${revenueOrQty}`
               const palette = ["#e67e22", "#16a085", "#8e44ad", "#2980b9", "#c0392b"]   
            
              const datasets=data.branches.flatMap((branch,i)=>{
                const color=palette[i %palette.length]
                return [
                    {
                        label:`${branch.name} - Sale ${revenueOrQty}`,
                        data:branch[saleField],
                        borderColor:color,
                        backgroundColor:color,
                        borderWidth:2,
                        fill:false
                    },
                    {
                        label:`${branch.name} Purchase ${revenueOrQty}`,
                        data:branch[purchaseField],
                        borderColor:color,
                        backgroundColor:color,
                        borderWidth:2,
                        borderDash:[6,4],
                        fill:false
                    }
                ]
              })

              const chartData={
                labels:data.months,
                datasets
              }


              if(branchChart){
                branchChart.data=chartData
                branchChart.update()
                return
              }


              branchChart=new Chart(branchCanvasRef.el,{
                type:"line",
                data:chartData,
                options:{
                    responsive:true,
                    maintainAspectRatio:false,
                    plugins:{legend:{position:"bottom"}},
                    scales:{y:{beginAtZero:true}}
                }
              })
            }
     

        return {

            page,
            totalPages,
            pagelabel,
            pagelabelSale,
            pagelabelPurchase,
            vendorLabel,
            toggle,
            toggleSale,
            togglePurchase,
            toggleVendor,
            reset,
            resetSale,
            resetPurchase,
            resetVendor,
            render,
            renderBranchTrend,
            canvasRef,
            purchasProductscanvasRef,
            renderpurchasProducts,
            saleProductscanvasRef,
            branchCanvasRef,
            vendorCanvasRef,
            renderSaleProducts,
            renderVendorSupplier
        }
}