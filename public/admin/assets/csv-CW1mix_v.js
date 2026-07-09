const p=({filename:o,rows:s})=>{const r=t=>{const c=String(t??"");return/[\",\n]/.test(c)?`"${c.replaceAll('"','""')}"`:c},a=(s||[]).map(t=>(t||[]).map(r).join(",")).join(`
`),l=new Blob([a],{type:"text/csv;charset=utf-8;"}),n=URL.createObjectURL(l),e=document.createElement("a");e.href=n,e.download=o||"export.csv",e.click(),URL.revokeObjectURL(n)};export{p as d};
