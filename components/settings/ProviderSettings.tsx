/**
 * Settings Page
 * 
 * Purpose: User settings including API keys and preferences
 * 
 * Key Elements:
 * - OpenRouter API key input
 * - Model selection
 * - Admin mode toggle
 * - Privacy settings
 * 
 * Dependencies:
 * - @/components/ui/*
 * - @/lib/ai/types
 * 
 * Last Updated: Initial setup
 */

"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { 
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { AVAILABLE_MODELS } from "@/lib/ai/types";
import {FamilyIcons} from "@/components/ui/FamilySymbol";
const {Key,Brain,Shield,AlertTriangle,Check,Eye,EyeOff}=FamilyIcons;
import {SettingsRouteNav} from "./SettingsRouteNav";
import {DataWaysOut} from "./DataWaysOut";
import { toast } from "sonner";

// Settings stored in localStorage
interface Settings {
  openRouterApiKey: string;
  selectedModel: string;
  adminMode: boolean;
  autoRedact: boolean;
}

const DEFAULT_SETTINGS: Settings = {
  openRouterApiKey: "",
  selectedModel: "anthropic/claude-sonnet-4",
  adminMode: false,
  autoRedact: true,
};

export function ProviderSettings() {
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [showApiKey, setShowApiKey] = useState(false);
  const [showAdminDialog, setShowAdminDialog] = useState(false);
  const [testingKey, setTestingKey] = useState(false);
  const [keyValid, setKeyValid] = useState<boolean | null>(null);

  // Load settings from localStorage
  useEffect(() => {
    try {
      const stored = localStorage.getItem("telltheirstories-settings");
      if(stored)setSettings({ ...DEFAULT_SETTINGS, ...JSON.parse(stored) });
    } catch { /* Keep defaults when browser storage is unavailable or malformed. */ }
  }, []);

  // Save settings to localStorage
  const saveSettings = (newSettings: Settings) => {
    setSettings(newSettings);
    try {localStorage.setItem("telltheirstories-settings", JSON.stringify(newSettings));toast.success("Settings saved");}
    catch {toast.error("Browser storage is unavailable. These settings are available for this session only.");}
  };

  // Test API key
  const testApiKey = async () => {
    if (!settings.openRouterApiKey) {
      toast.error("Please enter an API key");
      return;
    }

    setTestingKey(true);
    setKeyValid(null);

    try {
      const response = await fetch("https://openrouter.ai/api/v1/models", {
        headers: {
          "Authorization": `Bearer ${settings.openRouterApiKey}`,
        },
      });
      setKeyValid(response.ok);
      if (response.ok) {
        toast.success("Provider check responded successfully.");
      } else {
        toast.error("Provider check failed");
      }
    } catch {
      setKeyValid(false);
      toast.error("Failed to test API key");
    } finally {
      setTestingKey(false);
    }
  };

  // Handle admin mode toggle
  const handleAdminToggle = () => {
    if (settings.adminMode) {
      saveSettings({ ...settings, adminMode: false });
    } else {
      setShowAdminDialog(true);
    }
  };

  const confirmAdminMode = () => {
    saveSettings({ ...settings, adminMode: true });
    setShowAdminDialog(false);
    toast.success("Admin mode enabled");
  };

  return (
    <div className="mx-auto max-w-[1600px] p-4 sm:p-6 lg:p-8">
      <SettingsRouteNav active="provider"/>
      <div className="mb-6">
        <h1 className="mb-2 font-serif text-3xl font-semibold text-foreground">Settings</h1>
        <p className="text-muted-foreground">
          Browser preferences, legacy provider controls, and the ways your data leaves the vault
        </p>
      </div>

      <div className="space-y-6">
        <nav aria-label="Preference sections" className="flex flex-wrap gap-2 text-sm"><a href="#provider-key" className="inline-flex min-h-11 items-center px-3 text-primary underline">Provider key</a><a href="#your-data" className="inline-flex min-h-11 items-center px-3 text-primary underline">Your data</a></nav>
        {/* API Key Section */}
        <Card id="provider-key" className="scroll-mt-24">
          <CardHeader>
            <div className="flex items-center gap-2">
              <Key className="w-5 h-5 text-primary" />
              <CardTitle>OpenRouter API Key</CardTitle>
            </div>
            <CardDescription>
              Required for in-app AI processing. Get your key from{" "}
              <a 
                href="https://openrouter.ai/keys" 
                target="_blank" 
                rel="noopener noreferrer"
                className="text-primary hover:underline"
              >
                openrouter.ai/keys
              </a>
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-2">
              <div className="relative min-w-0 flex-1">
                <Label htmlFor="openrouter-api-key" className="sr-only">
                  OpenRouter API key
                </Label>
                <Input
                  id="openrouter-api-key"
                  type={showApiKey ? "text" : "password"}
                  placeholder="sk-or-..."
                  value={settings.openRouterApiKey}
                  onChange={(e) => setSettings({ ...settings, openRouterApiKey: e.target.value })}
                  className="h-11 pr-12"
                />
                <button
                  type="button"
                  onClick={() => setShowApiKey(!showApiKey)}
                  aria-label={showApiKey ? "Hide API key" : "Show API key"}
                  aria-pressed={showApiKey}
                  className="absolute right-0 top-1/2 flex min-h-11 min-w-11 -translate-y-1/2 items-center justify-center text-muted-foreground hover:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
                >
                  {showApiKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              <Button 
                variant="outline" 
                onClick={testApiKey}
                disabled={testingKey}
                className="min-h-11 w-full sm:w-auto"
              >
                {testingKey ? "Testing..." : "Test"}
              </Button>
            </div>
            {keyValid !== null && (
              <div className={`flex items-center gap-2 text-sm ${keyValid ? "text-primary" : "text-destructive"}`}>
                {keyValid ? (
                  <>
                    <Check className="w-4 h-4" />
                    Provider check responded successfully
                  </>
                ) : (
                  <>
                    <AlertTriangle className="w-4 h-4" />
                    Provider check failed
                  </>
                )}
              </div>
            )}
            <Button 
              onClick={() => saveSettings(settings)}
              className="min-h-11 bg-primary hover:bg-primary/90"
            >
              Save API Key
            </Button>
          </CardContent>
        </Card>

        {/* Model Selection */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Brain className="w-5 h-5 text-primary" />
              <CardTitle>AI Model</CardTitle>
            </div>
            <CardDescription>
              Choose which model to use for AI processing
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {AVAILABLE_MODELS.map((model) => (
                <button
                  key={model.id}
                  data-model={model.id}
                  aria-pressed={settings.selectedModel===model.id}
                  onClick={() => saveSettings({ ...settings, selectedModel: model.id })}
                  className={`p-4 rounded-lg border text-left transition-colors ${
                    settings.selectedModel === model.id
                      ? "border-primary bg-primary/5"
                      : "border-border hover:border-primary/50"
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-medium text-foreground">{model.name}</span>
                    {settings.selectedModel === model.id && (
                      <Check className="w-4 h-4 text-primary" />
                    )}
                  </div>
                  <div className="text-sm text-muted-foreground">
                    {model.provider} • ${model.costPer1kTokens}/1k tokens
                  </div>
                </button>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Privacy Settings */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Shield className="w-5 h-5 text-primary" />
              <CardTitle>Privacy</CardTitle>
            </div>
            <CardDescription>
              Control how sensitive information is handled
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col gap-4 rounded-lg bg-muted/40 p-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <Label className="text-foreground font-medium">
                  Auto-redact sensitive information
                </Label>
                <p className="text-sm text-muted-foreground mt-1">
                  Save your auto-redaction preference in this browser. Processing uses its own explicit redacted/original review controls; this saved preference is not currently read by those routes.
                </p>
              </div>
              <button
                onClick={() => saveSettings({ ...settings, autoRedact: !settings.autoRedact })}
                aria-label={settings.autoRedact ? "Disable auto-redact" : "Enable auto-redact"}
                aria-checked={settings.autoRedact}
                role="switch"
                className="relative flex min-h-11 w-12 shrink-0 items-center justify-center rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
              >
                <span
                  aria-hidden="true"
                  className={`relative h-6 w-12 rounded-full transition-colors ${
                    settings.autoRedact ? "bg-primary" : "bg-border"
                  }`}
                >
                  <span className={`absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-card shadow transition-transform ${
                    settings.autoRedact ? "translate-x-6" : "translate-x-0"
                  }`} />
                </span>
              </button>
            </div>
          </CardContent>
        </Card>

        {/* Admin Mode */}
        <Card className={settings.adminMode ? "border-annotation/40 bg-annotation/5" : ""}>
          <CardHeader>
            <div className="flex items-center gap-2">
              <AlertTriangle className={`w-5 h-5 ${settings.adminMode ? "text-annotation" : "text-muted-foreground"}`} />
              <CardTitle>Admin Mode</CardTitle>
              {settings.adminMode && (
                <Badge className="bg-annotation">Active</Badge>
              )}
            </div>
            <CardDescription>
              Legacy browser preference for development and testing. The extension has its own Admin Mode setting.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0 text-sm text-muted-foreground">
                {settings.adminMode 
                  ? "This browser preference is enabled. Check Admin Mode in the extension itself before a capture. This does not grant operator access."
                  : "Enable for development and testing purposes only."
                }
              </div>
              <Button
                variant={settings.adminMode ? "destructive" : "outline"}
                onClick={handleAdminToggle}
                className="min-h-11 w-full sm:w-auto"
              >
                {settings.adminMode ? "Disable" : "Enable"}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="mt-6"><DataWaysOut/></div>

      {/* Admin Mode Confirmation Dialog */}
      <Dialog open={showAdminDialog} onOpenChange={setShowAdminDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-annotation" />
              Enable Admin Mode preference?
            </DialogTitle>
            <DialogDescription asChild><div>
              The extension stores its own Admin Mode setting. When enabled there, Admin Mode is intended for development and testing only. It:
              <ul className="list-disc pl-5 mt-2 space-y-1">
                <li>Uses faster extraction pacing</li>
                <li>Removes expansion caps</li>
                <li>May trigger rate limiting on FamilySearch</li>
              </ul>
            </div></DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button className="min-h-11" variant="outline" onClick={() => setShowAdminDialog(false)}>
              Cancel
            </Button>
            <Button 
              className="min-h-11 bg-annotation hover:bg-annotation/90"
              onClick={confirmAdminMode}
            >
              I understand, enable Admin Mode
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
