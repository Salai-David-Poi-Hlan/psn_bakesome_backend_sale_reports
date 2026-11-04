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


    function render(items,metricKey){
        if (!canvasRef.el) return
        if (page.value>=totalPages(items)) page.value=0
        const start=page.value*PAGE_SIZE
        const pageItems=items.slice(start,start+PAGE_SIZE)

        const data={
            labels:pageItems.map((i)=>i.name),
            datasets:buildDataSets(pageItems,metricKey)
        }

        if(chartInstance){
            chartInstance.data=data
            chartInstance.update()
            return
        }

        chartInstance=new Chart(canvasRef.el,{
            type:"bar",
            data,
            options:{
                indexAxis,
                responsive:true,
                maintainAspectRatio:false,
                plugins:{legend:{display:legend}},
                scales:{x:{beginAtZero:true}}
            }
        })
    }
   
     function destroy(){
           chartInstance?.destroy()
     }
    

     return {pagelabel,toggle,reset,render,destroy}
}


export function usePageRankedChart(){

    const genericChart=createPageBarChart(useRef("barCanvas"),{
        buildDataSets:(items,metricKey)=>[
            {
                label:metricKey==="qty"?"Quantity"
                :metricKey === "packagingQty" ? "Package Quantity"
                :"Revenue",
                data:items.map((i)=>i[metricKey]),
                backgroundColor:"orange"
            }
        ]
    })



    const purchaseChart=createPageBarChart(useRef("productsBarCanvas"),{
        buildDataSets:(items,metricKey)=>{
             const purchaseKey=metricKey==="qty"?"purchaseQty":"purchaseRevenue"
             const saleKey=metricKey==="qty"?"saleQty":"saleRevenue"

             return[
                {
                     label:metricKey==="qty"?"Purchase Quantity":"Purchase Revenue",
                     data:items.map((i)=>i[purchaseKey]),
                     backgroundColor:"orange"
                },
                {
                    label:metricKey==="qty"?"Sale Quantity":"Sale Revenue",
                    data:items.map((i)=>i[saleKey]),
                    backgroundColor:"teal"
                }
             ]
        }
    })


    const saleChart=createPageBarChart(useRef("productsBarCanvas_Sale"),{
        buildDataSets:(items,metricKey)=>{
            const saleKey=metricKey==="qty"?"saleQty":"saleRevenue"
            const purchaseKey=metricKey==="qty"?"purchaseQty":"purchaseRevenue"
            return[
                {
                    label:metricKey==="qty"?"Sale Quantity":"Sale Revenue",
                    data:items.map((i)=>i[saleKey]),
                    backgroundColor:"orange"
                },
                {
                    label:metricKey==="qty"?"Purchase Quantity":"Purchase Revenue",
                    data:items.map((i)=>i[purchaseKey]),
                    backgroundColor:"teal" 
                }
            ]
        }
    })



    const vendorChart=createPageBarChart(useRef("vendorCanvas"),{
        buildDataSets:(items,metricKey)=>{
            const key=metricKey==="qty"?"totalQty":"totalRevenue"
            return[
                {
                    label:metricKey==="qty"?"Quantity":"Revenue",
                    data: items.map((i)=>i[key]),
                    backgroundColor:"orange"
                }
            ]
        }
    })

    const branchCanvasRef=useRef("branchCanvas")
        let branchChart=null;

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



               onWillUnmount(()=>{
            genericChart?.destroy()
            purchaseChart?.destroy()
            saleChart?.destroy()
            vendorChart?.destroy()
            branchChart?.destroy()
        })
     

        return {
          genericChart,
          purchaseChart,
          saleChart,
          vendorChart,
          renderBranchTrend,
          branchCanvasRef,
          
        }
}