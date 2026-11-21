// EXAMPLE ONLY — not wired into demo UI. Copy/rename when backend is ready.
// Identity tokens must come from a properly configured authentication provider.
export async function apiRequest(path, {method='GET',body,accessToken}={}) {
  const base=import.meta.env.VITE_API_BASE_URL;
  if(!base)throw new Error('Missing VITE_API_BASE_URL');
  const response=await fetch(`${base}${path}`,{
    method,
    headers:{
      'Content-Type':'application/json',
      ...(accessToken?{Authorization:`Bearer ${accessToken}`}:{})
    },
    ...(body===undefined?{}:{body:JSON.stringify(body)})
  });
  if(!response.ok)throw new Error(`API request failed (${response.status})`);
  return response.status===204?null:response.json();
}
