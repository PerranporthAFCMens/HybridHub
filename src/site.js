/* Hybrid Hub: mobile menu. */
(function(){
  var header=document.querySelector('.header'),toggle=document.querySelector('.menu-toggle');
  if(!header||!toggle)return;
  toggle.addEventListener('click',function(){var open=header.classList.toggle('open');toggle.setAttribute('aria-expanded',open)});
})();
/* Forms (Apply, START): sent by email through Web3Forms, using the form key in Pages CMS → Site settings. */
(function(){
  var form=document.querySelector('[data-form]');if(!form)return;
  var msg=form.querySelector('.form-msg'),btn=form.querySelector('button[type=submit]'),done=form.parentNode.querySelector('.form-done'),label=btn.textContent;
  // Preselect a choice from the button that was clicked, e.g. apply.html?plan=2X
  var plan=(location.search.match(/[?&]plan=([^&]+)/)||[])[1];
  if(plan){plan=decodeURIComponent(plan).toLowerCase();var r=[].slice.call(form.querySelectorAll('input[type=radio]')).filter(function(i){return i.value.toLowerCase().indexOf(plan)>-1})[0];if(r)r.checked=true}
  form.addEventListener('input',function(ev){var f=ev.target.closest('.field');if(f)f.classList.remove('invalid')});
  form.addEventListener('change',function(ev){var f=ev.target.closest('.field');if(f)f.classList.remove('invalid')});
  function nameOf(field){var l=field.querySelector('legend,span');return l?l.childNodes[0].textContent.trim():'this'}
  form.addEventListener('submit',function(ev){
    ev.preventDefault();msg.textContent='';
    var bad=[];
    form.querySelectorAll('.field').forEach(function(field){
      var ok=true;
      if(field.hasAttribute('data-group')){if(field.hasAttribute('data-required'))ok=!!field.querySelector('input:checked')}
      else{var i=field.querySelector('input,textarea'),v=i.value.trim();
        if(i.required&&!v)ok=false;
        else if(v&&i.type==='email'&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v))ok=false}
      field.classList.toggle('invalid',!ok);if(!ok)bad.push(field);
    });
    if(bad.length){msg.textContent='Please check: '+bad.map(nameOf).join(', ')+'.';var f=bad[0].querySelector('input,textarea');if(f)f.focus();return}
    if(form.elements.botcheck.checked)return;
    var key=form.getAttribute('data-key');
    if(!key){msg.textContent='Sorry, this form can’t send from the website yet. Please try again soon.';return}
    var data={access_key:key,subject:form.getAttribute('data-subject'),from_name:'Hybrid Hub website'};
    form.querySelectorAll('.field').forEach(function(field){
      var title=nameOf(field),value;
      if(field.hasAttribute('data-group'))value=[].map.call(field.querySelectorAll('input:checked'),function(i){return i.value}).join(', ');
      else{var i=field.querySelector('input,textarea');value=i.value.trim();if(i.type==='email'&&value)data.replyto=value}
      data[title]=value||'-';
    });
    btn.disabled=true;btn.textContent='Sending…';
    fetch('https://api.web3forms.com/submit',{method:'POST',headers:{'Content-Type':'application/json',Accept:'application/json'},body:JSON.stringify(data)})
      .then(function(r){return r.json()})
      .then(function(j){if(!j.success)throw new Error();form.hidden=true;done.hidden=false;var h=form.parentNode.querySelector('.form-head');if(h)h.hidden=true;done.scrollIntoView({block:'center',behavior:'smooth'})})
      .catch(function(){msg.textContent='Sorry, that didn’t send. Please check your connection and try again.'})
      .then(function(){btn.disabled=false;btn.textContent=label});
  });
})();
