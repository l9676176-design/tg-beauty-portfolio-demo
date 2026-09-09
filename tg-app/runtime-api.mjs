// Единая граница данных: HTTP для рабочего приложения, localStorage для портфолио.
export function createRuntimeApi(options={}){
  const mode=options.mode??'server';
  const localApi=options.localApi;
  const fetchImpl=options.fetchImpl??globalThis.fetch;
  return async function api(path,requestOptions={}){
    if(mode==='portfolio')return localApi.request(path,requestOptions);
    const controller=new AbortController();
    const timer=setTimeout(()=>controller.abort(),8000);
    try{
      const response=await fetchImpl(`/api/${path}`,{
        ...requestOptions,
        headers:{'Content-Type':'application/json',...requestOptions.headers},
        credentials:'same-origin',
        signal:controller.signal,
      });
      const data=await response.json();
      if(!response.ok){const error=new Error(data.error||'Не удалось выполнить действие.');error.status=response.status;throw error;}
      return data;
    }catch(error){
      if(error.name==='AbortError')throw new Error('Сервер долго не отвечает. Проверьте соединение.');
      throw error;
    }finally{clearTimeout(timer);}
  };
}
