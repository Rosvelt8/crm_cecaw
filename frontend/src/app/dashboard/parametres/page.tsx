'use client';

import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Settings, Shield, Building2, Globe, Smartphone, Palette, Cloud,
  Save, Undo, Plus, Trash2, Eye, EyeOff, Key, Database, AlertTriangle, RotateCcw,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';

const settingsSections = [
  { id: 'general',    title: 'Général',           icon: Settings,  desc: "Configuration globale de l'application." },
  { id: 'agence',     title: 'Agence & Structure', icon: Building2, desc: 'Gestion des agences et de la hiérarchie.' },
  { id: 'security',   title: 'Sécurité & RBAC',   icon: Shield,    desc: 'Rôles, permissions et politiques de mot de passe.' },
  { id: 'mobile',     title: 'App Mobile Terrain', icon: Smartphone,desc: 'Configuration du tracking et offline.' },
  { id: 'appearance', title: 'Apparence & Thème',  icon: Palette,   desc: 'Personnalisation visuelle du CRM.' },
  { id: 'api',        title: 'Intégrations & API', icon: Globe,     desc: 'Clés API, Webhooks et services externes.' },
  { id: 'donnees',    title: 'Données',            icon: Database,  desc: 'Réinitialisation et gestion des données.' },
];

const agences = [
  { id: 1, code: 'AG-001', nom: 'Douala Akwa', responsable: 'Ngassa Marie', tel: '699001122', actif: true },
  { id: 2, code: 'AG-002', nom: 'Douala Bonanjo', responsable: 'Talla Pierre', tel: '677334455', actif: true },
  { id: 3, code: 'AG-003', nom: 'Douala Bassa', responsable: 'Kamga Eric', tel: '655778899', actif: false },
  { id: 4, code: 'AG-004', nom: 'Douala Deido', responsable: 'Non assigné', tel: '', actif: true },
];

export default function SettingsPage() {
  const [activeSection, setActiveSection] = useState('general');

  // General
  const [general, setGeneral] = useState({
    institution: 'CECAW Microfinance',
    email: 'support@cecaw.cm',
    timezone: '(GMT+01:00) Douala, Lagos',
    devise: 'FCFA',
    dateFormat: 'DD/MM/YYYY',
    langue: 'fr',
  });

  // Agences
  const [agenceList, setAgenceList] = useState(agences);
  const [agenceForm, setAgenceForm] = useState({ nom: '', code: '', responsable: '', tel: '' });
  const [showAgenceForm, setShowAgenceForm] = useState(false);

  // Security
  const [security, setSecurity] = useState({
    mfaObligatoire: true,
    pwdMinLength: 8,
    pwdExpireJours: 90,
    maxLoginAttempts: 5,
    sessionTimeoutMin: 60,
  });

  // Mobile / Tracking
  const [mobile, setMobile] = useState({
    trackingInterval: 30,
    offlineMax: 48,
    geofenceRadius: 500,
    alerteHorsZone: true,
  });

  // Appearance
  const [appearance, setAppearance] = useState({
    primaryColor: '#1d4ed8',
    theme: 'system',
    compactMode: false,
    logoUrl: '',
  });

  // API / Intégrations
  const [apiKeys, setApiKeys] = useState([
    { id: 1, name: 'SMS Gateway (Orange CM)', key: 'sk_live_••••••••••••3f9a', actif: true },
    { id: 2, name: 'WhatsApp Business API', key: 'wh_••••••••••••a12b', actif: false },
  ]);
  const [showKey, setShowKey] = useState<number | null>(null);

  const handleSave = () => {
    toast.success('Paramètres enregistrés avec succès');
  };

  const [confirmReset, setConfirmReset] = useState(false);

  const resetAllData = () => {
    toast.info('La gestion des données est désormais assurée par le serveur. Contactez votre administrateur système.');
    setConfirmReset(false);
  };

  const addAgence = (e: React.FormEvent) => {
    e.preventDefault();
    if (!agenceForm.nom.trim() || !agenceForm.code.trim()) {
      toast.error('Nom et code requis');
      return;
    }
    setAgenceList((prev) => [
      ...prev,
      { id: Date.now(), ...agenceForm, actif: true },
    ]);
    setAgenceForm({ nom: '', code: '', responsable: '', tel: '' });
    setShowAgenceForm(false);
    toast.success('Agence ajoutée');
  };

  const toggleAgence = (id: number) => {
    setAgenceList((prev) =>
      prev.map((a) => (a.id === id ? { ...a, actif: !a.actif } : a))
    );
  };

  return (
    <div className="space-y-8">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Paramètres du Système</h1>
          <p className="text-muted-foreground">Configuration avancée du CRM pour les administrateurs.</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" className="h-9" onClick={() => toast.info('Paramètres réinitialisés')}>
            <Undo className="h-4 w-4 mr-2" /> Réinitialiser
          </Button>
          <Button variant="brand" size="sm" className="h-9" onClick={handleSave}>
            <Save className="h-4 w-4 mr-2" /> Enregistrer Tout
          </Button>
        </div>
      </div>

      <div className="grid gap-8 lg:grid-cols-4 items-start">
        {/* Navigation */}
        <div className="lg:col-span-1 space-y-2">
          {settingsSections.map((section) => (
            <div
              key={section.id}
              onClick={() => setActiveSection(section.id)}
              className={cn(
                'flex items-center gap-3 p-3 rounded-xl cursor-pointer transition-all',
                activeSection === section.id
                  ? 'bg-brand-600 text-white shadow-glow-blue'
                  : 'hover:bg-muted/50 text-muted-foreground hover:text-foreground'
              )}
            >
              <section.icon className="h-5 w-5 shrink-0" />
              <div className="flex flex-col">
                <span className="text-sm font-bold uppercase tracking-wider">{section.title}</span>
                <span className={cn('text-[10px]', activeSection === section.id ? 'text-brand-100' : 'text-muted-foreground')}>
                  {section.desc}
                </span>
              </div>
            </div>
          ))}
        </div>

        {/* Contenu */}
        <div className="lg:col-span-3 space-y-6">
          {/* ─── GÉNÉRAL ─── */}
          {activeSection === 'general' && (
            <Card className="animate-in fade-in duration-300">
              <CardHeader>
                <CardTitle>Configuration Générale</CardTitle>
                <CardDescription>Informations de base de l'institution CECAW.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Nom de l'Institution</Label>
                    <Input value={general.institution} onChange={(e) => setGeneral({ ...general, institution: e.target.value })} />
                  </div>
                  <div className="space-y-2">
                    <Label>Email de Support</Label>
                    <Input type="email" value={general.email} onChange={(e) => setGeneral({ ...general, email: e.target.value })} />
                  </div>
                </div>
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Devise par défaut</Label>
                    <Input value={general.devise} onChange={(e) => setGeneral({ ...general, devise: e.target.value })} />
                  </div>
                  <div className="space-y-2">
                    <Label>Format de Date</Label>
                    <Select value={general.dateFormat} onValueChange={(v) => setGeneral({ ...general, dateFormat: v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="DD/MM/YYYY">DD/MM/YYYY</SelectItem>
                        <SelectItem value="MM/DD/YYYY">MM/DD/YYYY</SelectItem>
                        <SelectItem value="YYYY-MM-DD">YYYY-MM-DD</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Langue principale</Label>
                    <Select value={general.langue} onValueChange={(v) => setGeneral({ ...general, langue: v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="fr">Français</SelectItem>
                        <SelectItem value="en">English</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Fuseau Horaire</Label>
                    <Input value={general.timezone} disabled className="bg-muted/50" />
                  </div>
                </div>
                <div className="pt-4 flex justify-end">
                  <Button variant="brand" onClick={handleSave}>Enregistrer</Button>
                </div>
              </CardContent>
            </Card>
          )}

          {/* ─── AGENCES ─── */}
          {activeSection === 'agence' && (
            <Card className="animate-in fade-in duration-300">
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle>Agences & Structure</CardTitle>
                  <CardDescription>Gérez les agences et leur hiérarchie organisationnelle.</CardDescription>
                </div>
                <Button variant="brand" size="sm" onClick={() => setShowAgenceForm(!showAgenceForm)}>
                  <Plus className="mr-2 h-4 w-4" /> Nouvelle Agence
                </Button>
              </CardHeader>
              <CardContent className="space-y-4">
                {showAgenceForm && (
                  <form onSubmit={addAgence} className="p-4 border rounded-xl bg-muted/20 space-y-3 animate-in fade-in">
                    <h3 className="text-sm font-bold">Nouvelle Agence</h3>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <Label className="text-xs">Code <span className="text-red-500">*</span></Label>
                        <Input required value={agenceForm.code} onChange={(e) => setAgenceForm({ ...agenceForm, code: e.target.value })} placeholder="AG-005" />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Nom <span className="text-red-500">*</span></Label>
                        <Input required value={agenceForm.nom} onChange={(e) => setAgenceForm({ ...agenceForm, nom: e.target.value })} placeholder="Douala Logbessou" />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Responsable</Label>
                        <Input value={agenceForm.responsable} onChange={(e) => setAgenceForm({ ...agenceForm, responsable: e.target.value })} placeholder="Nom du responsable" />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Téléphone</Label>
                        <Input value={agenceForm.tel} onChange={(e) => setAgenceForm({ ...agenceForm, tel: e.target.value })} placeholder="699..." />
                      </div>
                    </div>
                    <div className="flex gap-2 justify-end">
                      <Button type="button" variant="ghost" size="sm" onClick={() => setShowAgenceForm(false)}>Annuler</Button>
                      <Button type="submit" variant="brand" size="sm">Ajouter</Button>
                    </div>
                  </form>
                )}

                <div className="space-y-3">
                  {agenceList.map((a) => (
                    <div key={a.id} className="flex items-center justify-between p-4 border rounded-xl hover:bg-muted/30 transition-colors">
                      <div className="flex items-center gap-4">
                        <div className="h-10 w-10 rounded-full bg-brand-50 text-brand-600 flex items-center justify-center font-bold text-xs">
                          {a.code.replace('AG-', '')}
                        </div>
                        <div>
                          <div className="font-bold text-sm">{a.nom}</div>
                          <div className="text-[10px] text-muted-foreground">{a.code} • {a.responsable || 'Aucun responsable'}{a.tel ? ` • ${a.tel}` : ''}</div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant={a.actif ? 'success' : 'outline'}>
                          {a.actif ? 'Active' : 'Inactive'}
                        </Badge>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 text-xs"
                          onClick={() => toggleAgence(a.id)}
                        >
                          {a.actif ? 'Désactiver' : 'Activer'}
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* ─── SÉCURITÉ ─── */}
          {activeSection === 'security' && (
            <Card className="animate-in fade-in duration-300">
              <CardHeader>
                <CardTitle>Sécurité & Politique d'Accès</CardTitle>
                <CardDescription>Paramétrez les règles de sécurité et d'authentification.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="space-y-4">
                  <h3 className="text-sm font-bold uppercase tracking-wider text-muted-foreground">Authentification</h3>
                  <div className="flex items-center justify-between p-3 border rounded-lg">
                    <div>
                      <div className="font-medium text-sm">MFA Obligatoire</div>
                      <div className="text-xs text-muted-foreground">Imposer la double authentification à tous les utilisateurs</div>
                    </div>
                    <div
                      className={cn('h-6 w-11 rounded-full cursor-pointer transition-colors', security.mfaObligatoire ? 'bg-brand-600' : 'bg-muted')}
                      onClick={() => setSecurity({ ...security, mfaObligatoire: !security.mfaObligatoire })}
                    >
                      <div className={cn('h-4 w-4 rounded-full bg-white shadow m-1 transition-transform', security.mfaObligatoire ? 'translate-x-5' : '')} />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label className="text-xs">Longueur min. mot de passe</Label>
                      <Input
                        type="number" min="6" max="32"
                        value={security.pwdMinLength}
                        onChange={(e) => setSecurity({ ...security, pwdMinLength: Number(e.target.value) })}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-xs">Expiration MDP (jours)</Label>
                      <Input
                        type="number" min="0"
                        value={security.pwdExpireJours}
                        onChange={(e) => setSecurity({ ...security, pwdExpireJours: Number(e.target.value) })}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-xs">Tentatives max. de connexion</Label>
                      <Input
                        type="number" min="1" max="10"
                        value={security.maxLoginAttempts}
                        onChange={(e) => setSecurity({ ...security, maxLoginAttempts: Number(e.target.value) })}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-xs">Timeout session (min)</Label>
                      <Input
                        type="number" min="5"
                        value={security.sessionTimeoutMin}
                        onChange={(e) => setSecurity({ ...security, sessionTimeoutMin: Number(e.target.value) })}
                      />
                    </div>
                  </div>
                </div>
                <div className="pt-4 flex justify-end">
                  <Button variant="brand" onClick={handleSave}>Enregistrer</Button>
                </div>
              </CardContent>
            </Card>
          )}

          {/* ─── MOBILE ─── */}
          {activeSection === 'mobile' && (
            <Card className="animate-in fade-in duration-300">
              <CardHeader>
                <CardTitle>Application Mobile Terrain</CardTitle>
                <CardDescription>Configuration du tracking GPS et du mode offline.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Intervalle de tracking (secondes)</Label>
                    <Input
                      type="number" min="10"
                      value={mobile.trackingInterval}
                      onChange={(e) => setMobile({ ...mobile, trackingInterval: Number(e.target.value) })}
                    />
                    <p className="text-[10px] text-muted-foreground">Fréquence d'envoi de la position GPS</p>
                  </div>
                  <div className="space-y-2">
                    <Label>Mode offline max (heures)</Label>
                    <Input
                      type="number" min="1"
                      value={mobile.offlineMax}
                      onChange={(e) => setMobile({ ...mobile, offlineMax: Number(e.target.value) })}
                    />
                    <p className="text-[10px] text-muted-foreground">Durée max avant synchronisation obligatoire</p>
                  </div>
                  <div className="space-y-2">
                    <Label>Rayon géofence agence (mètres)</Label>
                    <Input
                      type="number" min="100"
                      value={mobile.geofenceRadius}
                      onChange={(e) => setMobile({ ...mobile, geofenceRadius: Number(e.target.value) })}
                    />
                  </div>
                </div>
                <div className="flex items-center justify-between p-3 border rounded-lg">
                  <div>
                    <div className="font-medium text-sm">Alerte hors zone</div>
                    <div className="text-xs text-muted-foreground">Notifier le superviseur si l'agent sort du rayon géofence</div>
                  </div>
                  <div
                    className={cn('h-6 w-11 rounded-full cursor-pointer transition-colors', mobile.alerteHorsZone ? 'bg-brand-600' : 'bg-muted')}
                    onClick={() => setMobile({ ...mobile, alerteHorsZone: !mobile.alerteHorsZone })}
                  >
                    <div className={cn('h-4 w-4 rounded-full bg-white shadow m-1 transition-transform', mobile.alerteHorsZone ? 'translate-x-5' : '')} />
                  </div>
                </div>
                <div className="pt-4 flex justify-end">
                  <Button variant="brand" onClick={handleSave}>Enregistrer</Button>
                </div>
              </CardContent>
            </Card>
          )}

          {/* ─── APPARENCE ─── */}
          {activeSection === 'appearance' && (
            <Card className="animate-in fade-in duration-300">
              <CardHeader>
                <CardTitle>Apparence & Thème</CardTitle>
                <CardDescription>Personnalisez l'interface du CRM.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="space-y-2">
                  <Label>Thème par défaut</Label>
                  <Select value={appearance.theme} onValueChange={(v) => setAppearance({ ...appearance, theme: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="light">Clair</SelectItem>
                      <SelectItem value="dark">Sombre</SelectItem>
                      <SelectItem value="system">Système (automatique)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Couleur principale (hex)</Label>
                  <div className="flex items-center gap-3">
                    <input
                      type="color"
                      value={appearance.primaryColor}
                      onChange={(e) => setAppearance({ ...appearance, primaryColor: e.target.value })}
                      className="h-10 w-10 rounded cursor-pointer border"
                    />
                    <Input
                      value={appearance.primaryColor}
                      onChange={(e) => setAppearance({ ...appearance, primaryColor: e.target.value })}
                      className="font-mono"
                    />
                  </div>
                </div>
                <div className="flex items-center justify-between p-3 border rounded-lg">
                  <div>
                    <div className="font-medium text-sm">Mode compact</div>
                    <div className="text-xs text-muted-foreground">Réduire l'espacement pour afficher plus d'informations</div>
                  </div>
                  <div
                    className={cn('h-6 w-11 rounded-full cursor-pointer transition-colors', appearance.compactMode ? 'bg-brand-600' : 'bg-muted')}
                    onClick={() => setAppearance({ ...appearance, compactMode: !appearance.compactMode })}
                  >
                    <div className={cn('h-4 w-4 rounded-full bg-white shadow m-1 transition-transform', appearance.compactMode ? 'translate-x-5' : '')} />
                  </div>
                </div>
                <div className="pt-4 flex justify-end">
                  <Button variant="brand" onClick={handleSave}>Enregistrer</Button>
                </div>
              </CardContent>
            </Card>
          )}

          {/* ─── API / INTÉGRATIONS ─── */}
          {activeSection === 'api' && (
            <Card className="animate-in fade-in duration-300">
              <CardHeader>
                <CardTitle>Intégrations & API</CardTitle>
                <CardDescription>Clés API, webhooks et services externes (SMS, WhatsApp).</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="space-y-3">
                  {apiKeys.map((api) => (
                    <div key={api.id} className="p-4 border rounded-xl space-y-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Key className="h-4 w-4 text-muted-foreground" />
                          <span className="font-bold text-sm">{api.name}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge variant={api.actif ? 'success' : 'outline'}>
                            {api.actif ? 'Actif' : 'Inactif'}
                          </Badge>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 text-xs"
                            onClick={() =>
                              setApiKeys((prev) =>
                                prev.map((k) => (k.id === api.id ? { ...k, actif: !k.actif } : k))
                              )
                            }
                          >
                            {api.actif ? 'Désactiver' : 'Activer'}
                          </Button>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Input
                          value={showKey === api.id ? `sk_live_real_key_${api.id}_example` : api.key}
                          readOnly
                          className="font-mono text-xs bg-muted/30"
                        />
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-9 w-9 shrink-0"
                          onClick={() => setShowKey(showKey === api.id ? null : api.id)}
                        >
                          {showKey === api.id ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-9 w-9 shrink-0 text-danger-600"
                          onClick={() => {
                            setApiKeys((prev) => prev.filter((k) => k.id !== api.id));
                            toast.success('Clé API supprimée');
                          }}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
                <Button
                  variant="outline"
                  className="w-full border-dashed"
                  onClick={() => {
                    const name = prompt('Nom de l\'intégration :');
                    if (name) {
                      setApiKeys((prev) => [
                        ...prev,
                        { id: Date.now(), name, key: `sk_••••••••••••${Math.random().toString(36).slice(2, 6)}`, actif: false },
                      ]);
                      toast.success('Clé API ajoutée');
                    }
                  }}
                >
                  <Plus className="mr-2 h-4 w-4" /> Ajouter une intégration
                </Button>
                <div className="pt-4 flex justify-end">
                  <Button variant="brand" onClick={handleSave}>Enregistrer</Button>
                </div>
              </CardContent>
            </Card>
          )}

          {/* ─── DONNÉES ─── */}
          {activeSection === 'donnees' && (
            <div className="space-y-4 animate-in fade-in duration-300">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Database className="h-5 w-5" /> Données de démonstration
                  </CardTitle>
                  <CardDescription>
                    Réinitialise toutes les données (utilisateurs, agences, produits, clients, transactions…) aux valeurs du seed initial. Les logs et mots de passe personnalisés seront également effacés.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="rounded-xl border border-red-200 bg-red-50 p-4 space-y-4">
                    <div className="flex items-start gap-3">
                      <AlertTriangle className="h-5 w-5 text-red-600 shrink-0 mt-0.5" />
                      <div>
                        <p className="text-sm font-bold text-red-700">Zone de danger</p>
                        <p className="text-xs text-red-600 mt-0.5">
                          Cette action est irréversible. Toutes les données saisies manuellement seront perdues et remplacées par les données de démonstration.
                        </p>
                      </div>
                    </div>
                    {!confirmReset ? (
                      <Button
                        variant="destructive"
                        size="sm"
                        className="gap-2"
                        onClick={() => setConfirmReset(true)}
                      >
                        <RotateCcw className="h-4 w-4" /> Réinitialiser toutes les données
                      </Button>
                    ) : (
                      <div className="space-y-2">
                        <p className="text-sm font-semibold text-red-700">Êtes-vous sûr ? Cette action ne peut pas être annulée.</p>
                        <div className="flex gap-2">
                          <Button variant="destructive" size="sm" className="gap-2" onClick={resetAllData}>
                            <RotateCcw className="h-4 w-4" /> Oui, réinitialiser
                          </Button>
                          <Button variant="outline" size="sm" onClick={() => setConfirmReset(false)}>Annuler</Button>
                        </div>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Contenu du seed</CardTitle>
                  <CardDescription>Aperçu de ce qui sera chargé après réinitialisation.</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-sm">
                    {[
                      ['9', 'Agences'],
                      ['7', 'Équipes'],
                      ['4', 'Groupes produits'],
                      ['22', 'Produits'],
                      ['230+', 'Utilisateurs'],
                      ['3', 'Agents terrain'],
                      ['5', 'Prospects'],
                      ['4', 'Clients'],
                      ['3', 'Objectifs'],
                    ].map(([count, label]) => (
                      <div key={label} className="flex items-center gap-3 p-3 rounded-lg bg-muted/40">
                        <span className="text-xl font-black">{count}</span>
                        <span className="text-xs text-muted-foreground">{label}</span>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </div>
          )}

          {/* Carte état du système (toujours visible) */}
          <Card className="bg-muted/20 border-dashed">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center">
                    <Cloud className="h-5 w-5 text-muted-foreground" />
                  </div>
                  <div className="flex flex-col">
                    <span className="text-sm font-bold uppercase tracking-wider">État du Système</span>
                    <span className="text-xs text-muted-foreground">Version 1.0.0-PROD • Tous les services opérationnels</span>
                  </div>
                </div>
                <Badge variant="success" className="h-6">ONLINE</Badge>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
