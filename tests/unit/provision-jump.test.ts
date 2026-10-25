import { afterEach, describe, expect, it, vi } from 'vitest';
import { approvedProvisionTargets, initProvisionJump } from '../../apps/web/src/lib/provision-jump.ts';
const origin='https://landesrecht-online.de';
const option=(anchor:string,url?:string)=>({value:anchor,dataset:{provisionUrl:url}});
function fixture(options=[option('paragraph-42','/west/norm/test/paragraph-42/'),option('paragraph-43','/west/norm/test/paragraph-43/')]) {
  const handlers=new Map<string,()=>void>();
  const select={options,value:options[0]!.value,addEventListener:vi.fn((event:string,handler:()=>void)=>handlers.set(event,handler))};
  const button={hidden:false};const hint={textContent:'Bitte mit Öffnen bestätigen.'};
  const form={dataset:{} as Record<string,string>,querySelector:(selector:string)=>selector.startsWith('select')?select:selector.startsWith('button')?button:hint} as unknown as HTMLFormElement;
  vi.stubGlobal('window',{location:{origin}});
  return {form,select,button,hint,change:()=>handlers.get('change')?.()};
}
afterEach(()=>vi.unstubAllGlobals());
describe('Progressive Direktnavigation',()=>{
  it('springt mit einer Änderung von § 42 zu § 43 und blendet Öffnen erst nach Bereitschaft aus',()=>{
    const f=fixture(),navigate=vi.fn();
    expect(f.button.hidden).toBe(false);
    initProvisionJump(f.form,navigate);
    expect(f.form.dataset.jumpReady).toBe('true');expect(f.button.hidden).toBe(true);
    expect(f.hint.textContent).toContain('sofort');
    expect(navigate).not.toHaveBeenCalled();
    f.select.value='paragraph-43';f.change();
    expect(navigate).toHaveBeenCalledExactlyOnceWith('/west/norm/test/paragraph-43/');
  });
  it('behält das historische, serverseitig bestimmte Ziel unverändert',()=>{
    const f=fixture([option('paragraph-42','/west/norm/test/version/2025-01-01/paragraph-42/'),option('paragraph-43','/west/norm/test/version/2025-01-01/paragraph-43/')]),navigate=vi.fn();
    initProvisionJump(f.form,navigate);f.select.value='paragraph-43';f.change();
    expect(navigate).toHaveBeenCalledWith('/west/norm/test/version/2025-01-01/paragraph-43/');
  });
  it('akzeptiert keine fremden, fehlenden oder widersprüchlichen Ziele',()=>{
    for(const url of ['https://example.test/path/','//example.test/path/','/\\example.test/path/','/west/norm/test/?mark=x','/west/norm/test/#x',undefined]) {
      const f=fixture([option('paragraph-42',url)]),navigate=vi.fn();initProvisionJump(f.form,navigate);
      expect(f.button.hidden).toBe(false);f.change();expect(navigate).not.toHaveBeenCalled();
    }
    expect(approvedProvisionTargets([{anchor:'a',url:'/a/'},{anchor:'a',url:'/b/'}],origin).size).toBe(0);
  });
  it('übernimmt nachträglich eingefügte Ziele nicht und lässt den Server-Fallback nutzbar',()=>{
    const f=fixture(),navigate=vi.fn();initProvisionJump(f.form,navigate);
    f.select.options.push(option('unknown','/unknown/'));f.select.value='unknown';f.change();
    expect(navigate).not.toHaveBeenCalled();expect(f.button.hidden).toBe(false);
  });
  it('initialisiert die Auswahl nur einmal',()=>{
    const f=fixture();initProvisionJump(f.form,vi.fn());initProvisionJump(f.form,vi.fn());
    expect(f.select.addEventListener).toHaveBeenCalledTimes(1);
  });
});
