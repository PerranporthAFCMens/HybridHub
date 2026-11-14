/* Hybrid Hub: mobile menu. */
(function(){
  var header=document.querySelector('.header'),toggle=document.querySelector('.menu-toggle');
  if(!header||!toggle)return;
  toggle.addEventListener('click',function(){var open=header.classList.toggle('open');toggle.setAttribute('aria-expanded',open)});
})();
