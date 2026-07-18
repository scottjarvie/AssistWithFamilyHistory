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
import { Key, Brain, Shield, AlertTriangle, Check, Eye, EyeOff } from "lucide-react";
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

export default function SettingsPage() {
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [showApiKey, setShowApiKey] = useState(false);
  const [showAdminDialog, setShowAdminDialog] = useState(false);
  const [testingKey, setTestingKey] = useState(false);
  const [keyValid, setKeyValid] = useState<boolean | null>(null);

  // Load settings from localStorage
  useEffect(() => {
    const stored = localStorage.getItem("telltheirstories-settings");
    if (stored) {
      try {
        setSettings({ ...DEFAULT_SETTINGS, ...JSON.parse(stored) });
      } catch {
        // Use defaults
      }
    }
  }, []);

  // Save settings to localStorage
  const saveSettings = (newSettings: Settings) => {
    setSettings(newSettings);
    localStorage.setItem("telltheirstories-settings", JSON.stringify(newSettings));
    toast.success("Settings saved");
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
        toast.success("API key is valid!");
      } else {
        toast.error("API key is invalid");
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
    <div className="max-w-4xl px-4 py-6 sm:p-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-stone-900 mb-2">Settings</h1>
        <p className="text-stone-500">
          Configure your AI integration and preferences
        </p>
      </div>

      <div className="space-y-6">
        {/* API Key Section */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Key className="w-5 h-5 text-amber-700" />
              <CardTitle>OpenRouter API Key</CardTitle>
            </div>
            <CardDescription>
              Required for in-app AI processing. Get your key from{" "}
              <a 
                href="https://openrouter.ai/keys" 
                target="_blank" 
                rel="noopener noreferrer"
                className="text-amber-700 hover:underline"
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
                  className="absolute right-0 top-1/2 flex min-h-11 min-w-11 -translate-y-1/2 items-center justify-center text-stone-400 hover:text-stone-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-700 focus-visible:ring-offset-2"
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
              <div className={`flex items-center gap-2 text-sm ${keyValid ? "text-green-600" : "text-red-600"}`}>
                {keyValid ? (
                  <>
                    <Check className="w-4 h-4" />
                    API key is valid
                  </>
                ) : (
                  <>
                    <AlertTriangle className="w-4 h-4" />
                    API key is invalid
                  </>
                )}
              </div>
            )}
            <Button 
              onClick={() => saveSettings(settings)}
              className="min-h-11 bg-amber-700 hover:bg-amber-800"
            >
              Save API Key
            </Button>
          </CardContent>
        </Card>

        {/* Model Selection */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Brain className="w-5 h-5 text-amber-700" />
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
                  onClick={() => saveSettings({ ...settings, selectedModel: model.id })}
                  className={`p-4 rounded-lg border text-left transition-colors ${
                    settings.selectedModel === model.id
                      ? "border-amber-700 bg-amber-50"
                      : "border-stone-200 hover:border-stone-300"
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-medium text-stone-900">{model.name}</span>
                    {settings.selectedModel === model.id && (
                      <Check className="w-4 h-4 text-amber-700" />
                    )}
                  </div>
                  <div className="text-sm text-stone-500">
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
              <Shield className="w-5 h-5 text-amber-700" />
              <CardTitle>Privacy</CardTitle>
            </div>
            <CardDescription>
              Control how sensitive information is handled
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col gap-4 rounded-lg bg-stone-50 p-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <Label className="text-stone-900 font-medium">
                  Auto-redact sensitive information
                </Label>
                <p className="text-sm text-stone-500 mt-1">
                  Automatically remove emails, phone numbers, and addresses before AI processing
                </p>
              </div>
              <button
                onClick={() => saveSettings({ ...settings, autoRedact: !settings.autoRedact })}
                aria-label={settings.autoRedact ? "Disable auto-redact" : "Enable auto-redact"}
                aria-checked={settings.autoRedact}
                role="switch"
                className="relative flex min-h-11 w-12 shrink-0 items-center justify-center rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-700 focus-visible:ring-offset-2"
              >
                <span
                  aria-hidden="true"
                  className={`relative h-6 w-12 rounded-full transition-colors ${
                    settings.autoRedact ? "bg-amber-700" : "bg-stone-300"
                  }`}
                >
                  <span className={`absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${
                    settings.autoRedact ? "translate-x-6" : "translate-x-0"
                  }`} />
                </span>
              </button>
            </div>
          </CardContent>
        </Card>

        {/* Admin Mode */}
        <Card className={settings.adminMode ? "border-orange-300 bg-orange-50" : ""}>
          <CardHeader>
            <div className="flex items-center gap-2">
              <AlertTriangle className={`w-5 h-5 ${settings.adminMode ? "text-orange-600" : "text-stone-400"}`} />
              <CardTitle>Admin Mode</CardTitle>
              {settings.adminMode && (
                <Badge className="bg-orange-600">Active</Badge>
              )}
            </div>
            <CardDescription>
              Development and testing mode with faster pacing and no caps
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0 text-sm text-stone-600">
                {settings.adminMode 
                  ? "Admin mode is enabled. Extension will use faster pacing."
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

      {/* Admin Mode Confirmation Dialog */}
      <Dialog open={showAdminDialog} onOpenChange={setShowAdminDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-orange-600" />
              Enable Admin Mode?
            </DialogTitle>
            <DialogDescription>
              Admin mode is intended for development and testing only. It:
              <ul className="list-disc pl-5 mt-2 space-y-1">
                <li>Uses faster extraction pacing</li>
                <li>Removes expansion caps</li>
                <li>May trigger rate limiting on FamilySearch</li>
              </ul>
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button className="min-h-11" variant="outline" onClick={() => setShowAdminDialog(false)}>
              Cancel
            </Button>
            <Button 
              className="min-h-11 bg-orange-600 hover:bg-orange-700"
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
