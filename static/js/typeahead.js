function debounce(fn, ms){ let t; return function(...args){ clearTimeout(t); t=setTimeout(()=>fn.apply(this,args), ms); }; }

function initTypeahead(inputId, hiddenId, endpoint){
  const input  = document.getElementById(inputId);
  const hidden = document.getElementById(hiddenId);
  const listId = inputId + "_list";
  let dl = document.getElementById(listId);
  if(!dl){
    dl = document.createElement('datalist');
    dl.id = listId;
    document.body.appendChild(dl);
  }
  input.setAttribute('list', listId);

  const search = debounce(async (q) => {
    if(!q || q.length < 1){ dl.innerHTML = ""; return; }
    const r = await fetch(`${endpoint}?q=${encodeURIComponent(q)}`);
    if(!r.ok) return;
    const js = await r.json();
    dl.innerHTML = "";
    js.forEach(item => {
      const opt = document.createElement('option');
      opt.value = item.label;
      opt.dataset.id = item.id;
      dl.appendChild(opt);
    });
  }, 150);

  input.addEventListener('input', (e)=>search(e.target.value));

  function resolveSelection(){
    const val = input.value;
    const opts = dl.querySelectorAll('option');
    let foundId = "";
    for(const o of opts){
      if(o.value === val){ foundId = o.dataset.id || ""; break; }
    }
    hidden.value = foundId;
  }

  input.addEventListener('change', resolveSelection);
  input.addEventListener('blur', resolveSelection);
}