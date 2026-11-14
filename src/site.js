/* Hybrid Hub: mobile menu. */
(function(){
  var header=document.querySelector('.header'),toggle=document.querySelector('.menu-toggle');
  if(!header||!toggle)return;
  toggle.addEventListener('click',function(){var open=header.classList.toggle('open');toggle.setAttribute('aria-expanded',open)});
})();
/* Application forms: sent by email through Web3Forms (the free form service set up in Pages CMS → Apply page → Form key). */
(function(){
  var form=document.querySelector('[data-form]');if(!form)return;
  var msg=form.querySelector('.form-msg'),btn=form.querySelector('button[type=submit]'),done=document.querySelector('.form-done');
  // Preselect the membership from the button that was clicked, e.g. apply.html?plan=2X
  var plan=(location.search.match(/[?&]plan=([^&]+)/)||[])[1];
  if(plan){plan=decodeURIComponent(plan).toLowerCase();var r=[].slice.call(form.querySelectorAll('input[name=membership]')).filter(function(i){return i.value.toLowerCase().indexOf(plan)>-1})[0];if(r)r.checked=true}
  form.addEventListener('submit',function(ev){
    ev.preventDefault();msg.textContent='';
    var f=form.elements,email=f.email.value.trim();
    if(!f.name.value.trim())return say('Please add your name.',f.name);
    if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))return say('Please add a valid email address.',f.email);
    if(form.querySelector('input[name=membership]')&&!form.querySelector('input[name=membership]:checked'))return say('Please choose a membership.');
    var key=form.getAttribute('data-key');
    if(!key)return say('Sorry, applications can’t be sent from the website yet. Please try again soon.');
    if(f.botcheck.checked)return;
    var times=[].slice.call(form.querySelectorAll('input[name=class_times]:checked')).map(function(i){return i.value}).join(', ');
    var data={access_key:key,subject:form.getAttribute('data-subject'),from_name:'Hybrid Hub website',replyto:email,
      name:f.name.value.trim(),email:email,phone:f.phone.value.trim(),
      membership:(form.querySelector('input[name=membership]:checked')||{}).value||'',class_times:times||'Not given',message:f.message.value.trim()};
    btn.disabled=true;btn.textContent='Sending…';
    fetch('https://api.web3forms.com/submit',{method:'POST',headers:{'Content-Type':'application/json',Accept:'application/json'},body:JSON.stringify(data)})
      .then(function(r){return r.json()})
      .then(function(j){if(!j.success)throw new Error();form.hidden=true;done.hidden=false;done.scrollIntoView({block:'center'})})
      .catch(function(){say('Sorry, that didn’t send. Please check your connection and try again.')})
      .then(function(){btn.disabled=false;btn.textContent=btn.getAttribute('data-label')});
  });
  btn.setAttribute('data-label',btn.textContent);
  function say(t,el){msg.textContent=t;if(el)el.focus()}
})();
