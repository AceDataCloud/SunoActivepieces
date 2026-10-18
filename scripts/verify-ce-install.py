import json,urllib.request,urllib.error,time,secrets,subprocess,pathlib
base='http://127.0.0.1:39128/api/v1';token=None
packages=[('@acedatacloud/piece-suno','0.1.2'),('@acedatacloud/piece-gpt-image','0.1.1'),('@acedatacloud/piece-seedance','0.1.1'),('@acedatacloud/piece-fish-audio','0.1.1'),('@acedatacloud/piece-seedream','0.1.1'),('@acedatacloud/piece-happyhorse','0.1.0'),('@acedatacloud/piece-nano-banana','0.1.0')]
def request(path,body=None,method=None):
 headers={'Content-Type':'application/json'}
 if token:headers['Authorization']='Bearer '+token
 req=urllib.request.Request(base+path,data=json.dumps(body).encode() if body is not None else None,headers=headers,method=method)
 try:
  r=urllib.request.urlopen(req,timeout=300);raw=r.read();return r.status,json.loads(raw) if raw else None
 except urllib.error.HTTPError as e:
  raw=e.read()
  # Do not emit credentials, connection exports or full host logs.
  try:value=json.loads(raw);code=value.get('code') or value.get('error') or value.get('message')
  except:code='non-json error'
  raise RuntimeError(f'Host HTTP {e.code} for {path.split("?")[0]}: {str(code)[:160]}') from None
for attempt in range(90):
 try:
  status,_=request('/flags')
  if status==200:break
 except Exception:time.sleep(2)
else:raise RuntimeError('Official CE did not become ready')
status,auth=request('/authentication/sign-up',{'email':'ace-ci-validation@example.com','password':secrets.token_urlsafe(24),'firstName':'Ace','lastName':'Validation','trackEvents':False,'newsLetter':False})
assert status in [200,201] and auth.get('platformRole')=='ADMIN';token=auth['token'];project=auth['projectId'];assert project
results=[]
# The official manual trigger is a dependency of the credential-free examples.
status,_=request('/pieces',{'packageType':'REGISTRY','scope':'PLATFORM','pieceName':'@activepieces/piece-manual-trigger','pieceVersion':'0.0.8'});assert status==201
for name,version in packages:
 status,metadata=request('/pieces',{'packageType':'REGISTRY','scope':'PLATFORM','pieceName':name,'pieceVersion':version});assert status==201;assert metadata['name']==name and metadata['version']==version
 root=pathlib.Path('/tmp/ace-public-consumer/node_modules')/name
 manifest=json.loads((root/'package.json').read_text());assert manifest['version']==version
 example=next((root/'examples').glob('*.json'));template=json.loads(example.read_text());flow=template['flows'][0]
 status,created=request('/flows',{'projectId':project,'displayName':name+' package validation'});assert status in [200,201]
 request_body={'displayName':flow['displayName'],'trigger':flow['trigger'],'schemaVersion':flow['schemaVersion'],'notes':flow.get('notes',[])}
 status,imported=request('/flows/'+created['id']+'?projectId='+project,{'type':'IMPORT_FLOW','request':request_body});assert status==200
 trigger=imported['version']['trigger'];create=trigger['nextAction'];lookup=create['nextAction'];assert create['settings']['input']['auth']==lookup['settings']['input']['auth']=='';assert create['settings']['errorHandlingOptions']['retryOnFailure']['value'] is False;assert (lookup['settings']['input'].get('taskId') or lookup['settings']['input'].get('task_id'))=="{{step_1['output']['task_id']}}";assert create['settings']['pieceVersion']==lookup['settings']['pieceVersion']==version
 result={'package':name,'version':version,'registry_install_http':201,'piece_display_name':metadata['displayName'],'actions':list(metadata['actions']),'quickstart_import_http':status,'same_task_mapping':True,'empty_connections':True,'creation_retries_disabled':True,'creation_executed':False,'lookup_executed':False};results.append(result);print(json.dumps(result),flush=True)
pathlib.Path('artifacts').mkdir(exist_ok=True);pathlib.Path('artifacts/ce-install.json').write_text(json.dumps({'as_of':time.strftime('%Y-%m-%dT%H:%M:%SZ',time.gmtime()),'host':'official activepieces/activepieces:0.92.3 Docker container','scope':'Disposable PGLITE CE instance, ordinaryNPMREGISTRYinstallandserverIMPORT_FLOW; noAPIkeys/noactionexecution','new_commercial_account':False,'business_API_requests':0,'results':results},indent=2)+'\n')
