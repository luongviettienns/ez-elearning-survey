const $ = (query,root=document) => root.querySelector(query);
const $$ = (query,root=document) => Array.from(root.querySelectorAll(query));
const form = $('#surveyForm');
const sections = $$('.form-section');
const progress = $('#scrollProgress');
const reduceMotion = false;
const hasObserver = 'IntersectionObserver' in window;
const motionEnabled = true;
const storySections = ['vision', 'problem', 'workflow', 'transparency', 'survey'].map(id=>document.getElementById(id));
const storyRail = $('#storyRail');
const workflow = $('#workflow');
const workflowPath = $('#workflowPathFill');
const hero = $('.hero');
let scrollFrame = 0;

document.documentElement.classList.add('motion-ready');

// Preserve the original heading text for assistive technologies while progressively
// revealing word-sized spans as the reader scrolls through the chapter.
const wordHeadings = $$('[data-word-reveal]');
for(const heading of wordHeadings){
  const walker=document.createTreeWalker(heading,NodeFilter.SHOW_TEXT);
  const textNodes=[];
  while(walker.nextNode())textNodes.push(walker.currentNode);
  for(const node of textNodes){
    const frag=document.createDocumentFragment();
    const normalized = (node.textContent || '').normalize('NFC');
    for(const piece of normalized.match(/\s+|\S+/g)||[]){
      if(/^\s+$/.test(piece)){frag.append(document.createTextNode(piece));continue;}
      const el=document.createElement('span');el.className='word-chip';el.textContent=piece;
      frag.append(el);
    }
    node.replaceWith(frag);
  }
}
const wordSpans = wordHeadings.map(e=>({heading:e,words:$$('.word-chip',e)}));

function updateScrollScene(){
  scrollFrame=0;
  const maxScroll=document.documentElement.scrollHeight-innerHeight;
  if(progress) progress.style.width=(maxScroll>0?Math.min(100,scrollY/maxScroll*100):0)+'%';

  if(storyRail){
    const show=scrollY>(hero?.offsetHeight||680)*.68 && ($('#survey')?.hidden!==true);
    storyRail.classList.toggle('is-visible',show);
    if(show){
      let current=storySections[0]?.id;
      for(const section of storySections){if(section&&section.getBoundingClientRect().top<innerHeight*.43)current=section.id;}
      $$('.story-rail a').forEach(link=>{
        const selected=link.dataset.story===current;
        link.classList.toggle('active',selected);
        if(selected)link.setAttribute('aria-current','location');
        else link.removeAttribute('aria-current');
      });
    }
  }
  if(!motionEnabled)return;

  if(hero&&scrollY<hero.offsetHeight+250){
    const shift=Math.min(58,scrollY*.11);
    hero.style.setProperty('--hero-shift',`${shift.toFixed(1)}px`);
  }
  for(const {heading,words} of wordSpans){
    const rect=heading.getBoundingClientRect();
    if(rect.top>innerHeight||rect.bottom<0)continue;
    const progress=Math.max(0,Math.min(1,(innerHeight*.82-rect.top)/(Math.max(300,rect.height+innerHeight*.24))));
    for(let i=0;i<words.length;i++){
      const reveal=Math.max(0,Math.min(1,progress*words.length-i+.5));
      words[i].style.opacity=(.23+reveal*.77).toFixed(2);
    }
  }
  if(workflow&&workflowPath){
    const rect=workflow.getBoundingClientRect();
    if(rect.top<innerHeight&&rect.bottom>0){
      const p=Math.max(0,Math.min(1,(innerHeight*.72-rect.top)/Math.max(360,rect.height*.5)));
      workflowPath.style.width=(p*100).toFixed(1)+'%';
    }
  }
}
function scheduleScrollScene(){if(!scrollFrame)scrollFrame=requestAnimationFrame(updateScrollScene);}
addEventListener('scroll',scheduleScrollScene,{passive:true});
addEventListener('resize',scheduleScrollScene,{passive:true});
scheduleScrollScene();

if(hasObserver){
  const revealObserver=new IntersectionObserver((entries,observer)=>{
    for(const entry of entries) if(entry.isIntersecting){
      entry.target.classList.add('visible');observer.unobserve(entry.target);
    }
  },{threshold:.09,rootMargin:'0px 0px -24px 0px'});
  // Stagger only within related groups, not across the entire lengthy form.
  const groups=['.problem-grid','.feature-stack','.workflow-board','.hero-copy'];
  for(const group of groups){
    $$('.reveal',$(group)||document.createElement('div')).forEach((el,index)=>{
      if(el.closest(group))el.style.setProperty('--reveal-delay',`${Math.min(index,4)*100}ms`);
    });
  }
  $$('.reveal').forEach(el=>revealObserver.observe(el));
  if(motionEnabled){
    $$('.form-chapter, .question').forEach(el=>{el.classList.add('question-reveal');revealObserver.observe(el);});
    $$('.spotlight-mark').forEach(el=>revealObserver.observe(el));
  } else $$('.spotlight-mark').forEach(el=>el.classList.add('visible'));

  const specialObserver=new IntersectionObserver((entries,observer)=>{
    for(const entry of entries)if(entry.isIntersecting){
      const el=entry.target;el.classList.add('in-view');
      if(el.dataset.countUp){
        const target=Number(el.dataset.countUp);
        if(!reduceMotion){
          const start=performance.now();
          function frame(now){
            const t=Math.min(1,(now-start)/1350);
            const eased=1-Math.pow(1-t,4);
            el.textContent=Math.round(target*eased).toLocaleString('vi-VN');
            if(t<1)requestAnimationFrame(frame);
          }
          requestAnimationFrame(frame);
        } else el.textContent=target.toLocaleString('vi-VN');
      }
      observer.unobserve(el);
    }
  },{threshold:.35});
  $$('[data-count-up], .workflow-board').forEach(el=>specialObserver.observe(el));

  const stepObserver=new IntersectionObserver(entries=>{
    for(const e of entries)if(e.isIntersecting){
      const step=e.target.id.replace('part','');
      $$('.track-item').forEach(item=>item.classList.toggle('active',item.dataset.step===step));
    }
  },{rootMargin:'-15% 0px -60% 0px',threshold:0});
  sections.forEach(e=>stepObserver.observe(e));
} else { $$('.reveal,.question-reveal,.spotlight-mark').forEach(e=>e.classList.add('visible')); }

function readAnswers(){
  const result={};
  const fields=['level','subject','aiExperience','timeConsumingTasks','lessonPlanTroubles','quizExpectations','visualNeeds','monthlyWorkload','flexiblePricing','monthlyBudget','primaryDevice','suggestion','contact','aiNeeds','imageTroubles','imageRetries','imageTypes','imageValue','monthlyUses','payPerImage','paymentModel','features'];
  for(const key of fields){
    const values=$$(`input[name="${key}"]:checked`,form).map(x=>x.value);
    if($(`input[name="${key}"][type="checkbox"]`,form)) result[key]=values;
    else if($(`input[name="${key}"][type="radio"]`,form)) result[key]=values[0]||'';
    else result[key]=$(`[name="${key}"]`,form)?.value.trim()||'';
  }
  return result;
}
function alertMessage(message,target){
  const el=$('#formAlert');el.hidden=false;el.textContent=message;
  if(target)target.scrollIntoView({behavior:reduceMotion?'auto':'smooth',block:'center'});
  else el.scrollIntoView({behavior:reduceMotion?'auto':'smooth',block:'center'});
}
function validate(){
  const required=['level','aiExperience','flexiblePricing','monthlyBudget'];
  for(const k of required){
    if(!$(`input[name="${k}"]:checked`,form)){
      const target=$(`[data-key="${k}"]`,form);alertMessage('Vui lòng trả lời câu hỏi bắt buộc này trước khi gửi.',target);return false;
    }
  }
  if($('#contact').value&&$('#contact').value.includes('@')&&!$('#contact').checkValidity()){alertMessage('Email chưa đúng định dạng. Thầy/Cô có thể sửa hoặc để trống.',$('#contact'));return false;}
  if(!$('input[name="consent"]:checked',form)){alertMessage('Vui lòng xác nhận đồng ý với mục đích thu thập ý kiến.',$('.consent-box'));return false;}
  return true;
}
form.addEventListener('submit',async(e)=>{
  e.preventDefault(); $('#formAlert').hidden=true;
  if(!validate())return;
  const btn=$('#submitBtn'),label=$('span',btn);btn.disabled=true;label.textContent='Đang ghi nhận ý kiến...';
  try{
    const response=await fetch('/api/survey',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({answers:readAnswers(),consent:true,website:$('input[name="website"]').value})});
    const data=await response.json();
    if(!response.ok||!data.ok)throw new Error(data.error||'Không thể gửi khảo sát.');
    $('#survey').hidden=true;
    $('#thankyou').hidden=false;
    $('#confirmationCode').textContent=data.id?'Mã phản hồi: #'+data.id:'';
    history.replaceState({},'',location.pathname+'#thankyou');
    $('#thankyou').scrollIntoView({behavior:reduceMotion?'auto':'smooth',block:'start'});
    try{
      localStorage.setItem('ez-survey-submitted','true');
      localStorage.removeItem('ez-survey-draft-v1');
    }catch{}
  }catch(err){alertMessage(err.message+' Vui lòng kiểm tra kết nối và gửi lại.');}
  finally{btn.disabled=false;label.textContent='Gửi ý kiến của Thầy Cô';}
});

// ==================== Tự động lưu nháp (Auto-save) ====================
const DRAFT_KEY = 'ez-survey-draft-v1';
const draftIndicator = $('#draftIndicator');

function saveDraft(){
  try {
    const answers = readAnswers();
    localStorage.setItem(DRAFT_KEY, JSON.stringify(answers));
    if(draftIndicator){
      draftIndicator.classList.add('is-saving');
      setTimeout(()=>draftIndicator.classList.remove('is-saving'), 800);
    }
  } catch(e) {}
}

function restoreDraft(){
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    if(!raw) return;
    const draft = JSON.parse(raw);
    for(const [key, val] of Object.entries(draft)){
      if(Array.isArray(val)){
        val.forEach(v=>{
          const el = $(`input[name="${key}"][value="${CSS.escape(v)}"]`, form);
          if(el) el.checked = true;
        });
      } else if(typeof val === 'string' && val){
        const radio = $(`input[name="${key}"][value="${CSS.escape(val)}"]`, form);
        if(radio) radio.checked = true;
        else {
          const field = $(`[name="${key}"]`, form);
          if(field && (field.tagName === 'INPUT' || field.tagName === 'TEXTAREA')) field.value = val;
        }
      }
    }
  } catch(e) {}
}

if(form){
  restoreDraft();
  form.addEventListener('input', saveDraft);
  form.addEventListener('change', saveDraft);
}

// ==================== Cần trợ giúp widget ====================
const helpBtn = $('#helpBtn');
const helpPopup = $('#helpPopup');
const helpClose = $('#helpClose');

if(helpBtn && helpPopup){
  helpBtn.addEventListener('click', (e)=>{
    e.stopPropagation();
    const open = !helpPopup.hidden;
    helpPopup.hidden = open;
    helpBtn.setAttribute('aria-expanded', String(!open));
  });
  if(helpClose) helpClose.addEventListener('click', (e)=>{
    e.stopPropagation();
    helpPopup.hidden = true;
    helpBtn.setAttribute('aria-expanded', 'false');
  });
  document.addEventListener('click', (e)=>{
    if(!helpPopup.hidden && !e.target.closest('#helpWidget')){
      helpPopup.hidden = true;
      helpBtn.setAttribute('aria-expanded', 'false');
    }
  });
}

