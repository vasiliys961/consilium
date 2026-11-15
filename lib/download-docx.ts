/** Use a native HTTP attachment download: Safari/WebView must not rely on a short-lived detached blob URL. */
export async function downloadDocx(title:string,text:string,locale:string){
 if(text.length>250000)throw Error('DOCX export is too large');
 const target=`docx-${crypto.randomUUID()}`;
 const frame=document.createElement('iframe');frame.name=target;frame.hidden=true;document.body.appendChild(frame);
 const form=document.createElement('form');form.method='POST';form.action='/api/export/docx';form.target=target;form.hidden=true;
 for(const [name,value]of Object.entries({title,text,locale})){const field=document.createElement('input');field.type='hidden';field.name=name;field.value=value;form.appendChild(field);}
 document.body.appendChild(form);form.submit();form.remove();setTimeout(()=>frame.remove(),300000);
}
