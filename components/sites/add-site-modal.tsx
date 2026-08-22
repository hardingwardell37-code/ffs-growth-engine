"use client";
import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

const fields = [["businessName","Business Name"],["websiteUrl","Website URL"],["industry","Industry"],["primaryService","Primary Service"],["city","City"],["state","State"]] as const;

export function AddSiteModal({ triggerLabel = "Add client" }: { triggerLabel?: string }) {
  const router = useRouter(); const [open,setOpen] = useState(false); const [saving,setSaving] = useState(false); const [error,setError] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setSaving(true); setError(""); const form = new FormData(event.currentTarget);
    const payload = Object.fromEntries(fields.map(([name]) => [name,String(form.get(name)||"").trim()]));
    const competitors = [1,2,3].map(n => String(form.get(`competitor${n}`)||"").trim()).filter(Boolean);
    try { const response = await fetch("/api/sites",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({...payload,competitors})}); const body=await response.json(); if(!response.ok) throw new Error(body.error||"Could not add client"); setOpen(false); router.push(`/sites/${body.id}`); router.refresh(); }
    catch(reason){ setError(reason instanceof Error?reason.message:"Could not add client"); } finally { setSaving(false); }
  }
  return <Dialog open={open} onOpenChange={setOpen}><DialogTrigger render={<Button />}>{triggerLabel}</DialogTrigger><DialogContent className="sm:max-w-xl"><DialogHeader><DialogTitle>Add client</DialogTitle><DialogDescription>Create the business profile and website workspace.</DialogDescription></DialogHeader><form onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
    {fields.map(([name,label])=><label key={name} className="grid gap-1 text-sm"><span>{label}</span><input required name={name} type={name==="websiteUrl"?"url":"text"} placeholder={name==="websiteUrl"?"https://example.com":""} className="h-10 rounded-md border border-input bg-background px-3" /></label>)}
    {[1,2,3].map(n=><label key={n} className="grid gap-1 text-sm sm:col-span-2"><span>Competitor Website {n} <em className="text-muted-foreground">optional</em></span><input name={`competitor${n}`} type="url" className="h-10 rounded-md border border-input bg-background px-3" /></label>)}
    {error&&<p className="text-sm text-danger sm:col-span-2">{error}</p>}<div className="flex justify-end gap-2 sm:col-span-2"><Button type="button" variant="outline" onClick={()=>setOpen(false)}>Cancel</Button><Button type="submit" disabled={saving}>{saving?"Saving…":"Create client"}</Button></div>
  </form></DialogContent></Dialog>;
}
