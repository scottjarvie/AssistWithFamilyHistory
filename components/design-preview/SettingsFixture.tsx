import {ApiCenterView} from "@/components/api/ApiCenterView";
import {ProviderSettings} from "@/components/settings/ProviderSettings";
import {AiConnectionsView} from "@/components/ai/AiConnectionsView";
import {BaselineAiConnectionsView} from "./BaselineAiConnectionsView";
import {BaselineApiCenterView} from "./BaselineApiCenterView";
import {BaselineOperatorView} from "./BaselineOperatorView";
import {BaselineProviderSettings} from "./BaselineProviderSettings";
import {settingsConnections,settingsActivity,settingsKeys} from "./settingsFixtures";

export function SettingsFixture({surface,baseline=false}:{surface:string;baseline?:boolean}) {
  const kind=surface.replace(/^baseline-/,"");
  if(kind==="settings-provider")return baseline?<BaselineProviderSettings/>:<ProviderSettings/>;
  const ai=kind.startsWith("settings-ai"),admin=kind==="settings-admin";
  if(baseline)return ai?<BaselineAiConnectionsView connections={settingsConnections} activity={settingsActivity}/>:admin?<BaselineOperatorView keys={settingsKeys}/>:<BaselineApiCenterView keys={settingsKeys} admin={false}/>;
  if(ai)return <AiConnectionsView connections={kind.endsWith("empty")?[]:settingsConnections} activity={settingsActivity} ownerKey="synthetic-settings-only"/>;
  return <ApiCenterView keys={settingsKeys} ownerKey="synthetic-settings-only" admin={admin} operatorView={admin}/>;
}
