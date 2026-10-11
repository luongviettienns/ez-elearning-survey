const $=q=>document.querySelector(q);
const titleMap={
  level:'01. Cấp học',
  aiExperience:'03. Kinh nghiệm dùng AI',
  timeConsumingTasks:'04. Khâu tốn thời gian nhất',
  lessonPlanTroubles:'05. Khó khăn soạn giáo án 5512',
  quizExpectations:'06. Yêu cầu với đề trắc nghiệm',
  visualNeeds:'07. Nhu cầu đồ họa & sơ đồ',
  monthlyWorkload:'08. Số lượng bài chuẩn bị/tháng',
  flexiblePricing:'09. Ý kiến phí linh hoạt theo độ khó',
  monthlyBudget:'10. Ngân sách hàng tháng',
  primaryDevice:'11. Thiết bị soạn bài thường dùng',
  payPerImage:'[Cũ] Ý kiến giá 1.000đ/ảnh',
  imageTroubles:'[Cũ] Khó khăn khi tạo ảnh',
  features:'[Cũ] Tính năng mong muốn'
};
let secret='';
function showError(message){$('#adminError').textContent=message}
async function authFetch(url){const response=await fetch(url,{headers:{Authorization:'Bearer '+secret},cache:'no-store'});if(!response.ok){const d=await response.json().catch(()=>({}));throw new Error(d.error||'Yêu cầu thất bại.')}return response;}
async function refresh(){
  const data=await(await authFetch('/api/admin/overview')).json();
  $('#total').textContent=data.count.toLocaleString('vi-VN');
  const grid=$('#statGrid'); grid.replaceChildren();
  Object.entries(titleMap).forEach(([key,name])=>{
    const card=document.createElement('section');card.className='stat-card';
    const h=document.createElement('h3');h.textContent=name;card.append(h);
    const values=Object.entries(data.groups[key]||{}).sort((a,b)=>b[1]-a[1]);
    if(!values.length){const e=document.createElement('p');e.className='empty';e.textContent='Chưa có dữ liệu';card.append(e)}
    else values.forEach(([label,n])=>{const wrap=document.createElement('div');wrap.className='bar-entry';const top=document.createElement('div');top.className='bar-label';const text=document.createElement('span');text.textContent=label;const count=document.createElement('b');count.textContent=String(n);top.append(text,count);const track=document.createElement('div');track.className='bar-track';const fill=document.createElement('div');fill.className='bar-fill';fill.style.width=Math.max(3,n/data.count*100)+'%';track.append(fill);wrap.append(top,track);card.append(wrap)});
    grid.append(card);
  });
}
$('#adminAuth').addEventListener('submit',async(e)=>{e.preventDefault();secret=$('#secret').value;showError('');try{await refresh();$('#adminAuth').hidden=true;$('#dashboard').hidden=false;}catch(e){showError(e.message)}});
$('#refresh').addEventListener('click',()=>refresh().catch(e=>alert(e.message)));
$('#logout').addEventListener('click',()=>{secret='';$('#secret').value='';$('#adminAuth').hidden=false;$('#dashboard').hidden=true;showError('')});
document.querySelectorAll('[data-export]').forEach(btn=>btn.addEventListener('click',async()=>{try{const ext=btn.dataset.export;const response=await authFetch('/api/admin/export.'+ext);const url=URL.createObjectURL(await response.blob());const a=document.createElement('a');a.href=url;a.download='ez-elearning-khao-sat.'+ext;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);}catch(e){alert(e.message)}}));
