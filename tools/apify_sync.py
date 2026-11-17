"""Download an existing Apify dataset and preview/import it into the existing Blogger CRM.
No Instagram login, browser automation or outgoing DMs. Tokens only from environment.
"""
import argparse,json,os,re,sys
from urllib.request import Request,build_opener,HTTPRedirectHandler
from urllib.parse import urlsplit
class NoRedirect(HTTPRedirectHandler):
 def redirect_request(self,*args,**kwargs):return None
opener=build_opener(NoRedirect)
def request(url,token,data=None):
 body=json.dumps(data).encode() if data is not None else None
 req=Request(url,data=body,headers={'Authorization':'Bearer '+token,'Content-Type':'application/json'})
 with opener.open(req,timeout=60) as r:
  raw=r.read(9*1024*1024+1)
  if len(raw)>9*1024*1024:raise ValueError('Ответ слишком большой: разделите выгрузку')
  return json.loads(raw)
def main():
 p=argparse.ArgumentParser();p.add_argument('--dataset-id',required=True);p.add_argument('--commit',action='store_true');p.add_argument('--include-related',action='store_true');args=p.parse_args()
 if not re.fullmatch(r'[A-Za-z0-9_-]{1,100}',args.dataset_id):p.error('Некорректный dataset ID')
 apify=os.environ.get('APIFY_TOKEN','');crm=os.environ.get('MIXIT_CRM_URL','').rstrip('/');token=os.environ.get('MIXIT_CRM_TOKEN','')
 if not apify or not token or urlsplit(crm).scheme!='https':p.error('Нужны APIFY_TOKEN, MIXIT_CRM_TOKEN и HTTPS MIXIT_CRM_URL в окружении')
 rows=request('https://api.apify.com/v2/datasets/'+args.dataset_id+'/items?clean=true&format=json&limit=5000',apify)
 payload={'format':'json','content':json.dumps(rows,ensure_ascii=False),'dryRun':True,'includeRelated':args.include_related}
 preview=request(crm+'/api/discovery/import',token,payload)
 print(json.dumps({k:preview[k] for k in ('created','duplicates','errors','dryRun')},ensure_ascii=False))
 if args.commit:
  if preview['errors']:raise ValueError('Ошибки: запись не выполнена')
  payload['dryRun']=False;result=request(crm+'/api/discovery/import',token,payload)
  print(json.dumps({k:result[k] for k in ('created','duplicates','dryRun')},ensure_ascii=False))
if __name__=='__main__':
 try:main()
 except Exception as e:
  # Do not log tokens, request bodies, or URLs supplied by error messages.
  print('Синхронизация не завершена: '+type(e).__name__,file=sys.stderr);sys.exit(1)
