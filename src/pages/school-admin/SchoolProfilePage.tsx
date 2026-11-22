import React, { useEffect, useState } from 'react';
import { Building2, Upload } from 'lucide-react';
import { PageHeader } from '../../components/dashboard/PageHeader.tsx';
import { Alert } from '../../components/ui/alert.tsx';
import { Button } from '../../components/ui/button.tsx';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../components/ui/card.tsx';
import { Input } from '../../components/ui/input.tsx';
import { Label } from '../../components/ui/label.tsx';
import { Select } from '../../components/ui/select.tsx';
import { useToast } from '../../context/ToastContext.tsx';
import { apiRequest } from '../../lib/api.ts';
import { formatBytes, readFileAsBase64 } from '../../lib/files.ts';
import type { SchoolProfileFull } from '../../types/app.ts';

export function SchoolProfilePage() {
  const { showToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [profile, setProfile] = useState<SchoolProfileFull | null>(null);

  const [name, setName] = useState('');
  const [registrationNumber, setRegistrationNumber] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [website, setWebsite] = useState('');
  const [country, setCountry] = useState('');
  const [state, setState] = useState('');
  const [city, setCity] = useState('');
  const [physicalAddress, setPhysicalAddress] = useState('');
  const [motto, setMotto] = useState('');
  const [description, setDescription] = useState('');
  const [schoolType, setSchoolType] = useState('Secondary');
  const [schoolOwnership, setSchoolOwnership] = useState('Private');
  const [establishedYear, setEstablishedYear] = useState('');
  const [logoFile, setLogoFile] = useState<File | null>(null);

  const hydrate = (p: SchoolProfileFull) => {
    setProfile(p);
    setName(p.name ?? '');
    setRegistrationNumber(p.registration_number ?? '');
    setContactEmail(p.contact_email ?? '');
    setPhone(p.phone ?? '');
    setWebsite(p.website ?? '');
    setCountry(p.country ?? '');
    setState(p.state ?? '');
    setCity(p.city ?? '');
    setPhysicalAddress(p.physical_address ?? '');
    setMotto(p.motto ?? '');
    setDescription(p.description ?? '');
    setSchoolType(p.school_type || 'Secondary');
    setSchoolOwnership(p.school_ownership || 'Private');
    setEstablishedYear(p.established_year ? String(p.established_year) : '');
  };

  useEffect(() => {
    let active = true;
    apiRequest<{ profile: SchoolProfileFull }>('/api/school/profile')
      .then((res) => {
        if (!active) return;
        hydrate(res.profile);
      })
      .catch((err) => {
        if (!active) return;
        setError(err instanceof Error ? err.message : 'Unable to load school profile.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      const parsedYear = establishedYear.trim() ? Number(establishedYear.trim()) : null;
      const res = await apiRequest<{ profile: SchoolProfileFull }>('/api/school/profile', {
        method: 'PUT',
        body: JSON.stringify({
          name: name.trim(),
          registrationNumber: registrationNumber.trim(),
          contactEmail: contactEmail.trim(),
          phone: phone.trim(),
          website: website.trim(),
          country: country.trim(),
          state: state.trim(),
          city: city.trim(),
          physicalAddress: physicalAddress.trim(),
          motto: motto.trim(),
          description: description.trim(),
          schoolType,
          schoolOwnership,
          establishedYear: parsedYear,
        }),
      });
      hydrate(res.profile);
      showToast({
        variant: 'success',
        title: 'School profile updated',
        description: 'Institutional details and metadata were saved successfully.',
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unable to update school profile.';
      setError(msg);
      showToast({ variant: 'error', title: 'Save failed', description: msg });
    } finally {
      setSaving(false);
    }
  };

  const handleLogoUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!logoFile) return;
    setUploadingLogo(true);
    setError(null);
    try {
      const contentBase64 = await readFileAsBase64(logoFile);
      const res = await apiRequest<{ logoFileId: string }>('/api/school/profile/logo', {
        method: 'POST',
        body: JSON.stringify({
          fileName: logoFile.name,
          mimeType: logoFile.type || 'image/png',
          contentBase64,
        }),
      });
      setProfile((prev) => (prev ? { ...prev, logo_file_id: res.logoFileId } : prev));
      setLogoFile(null);
      const input = document.getElementById('school-logo-upload') as HTMLInputElement | null;
      if (input) input.value = '';
      showToast({
        variant: 'success',
        title: 'School logo uploaded',
        description: 'Institutional crest updated inside private tenant storage.',
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unable to upload school logo.';
      setError(msg);
      showToast({ variant: 'error', title: 'Logo upload failed', description: msg });
    } finally {
      setUploadingLogo(false);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="School Profile & Identity"
        description="Manage your institution's official registration details, contact channels, motto, and school crest."
      />

      {error ? <Alert variant="error">{error}</Alert> : null}

      <Card>
        <CardHeader>
          <CardTitle>Institutional Crest & Branding</CardTitle>
          <CardDescription>
            Upload a PNG, JPEG, or WebP emblem for official student reports and portal headers.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleLogoUpload} className="flex flex-col gap-5 sm:flex-row sm:items-center">
            {profile?.logo_file_id ? (
              <img
                src={`/api/school/files/${profile.logo_file_id}/download`}
                alt={`${profile.name} logo`}
                className="h-20 w-20 rounded-xl border border-slate-200 object-cover bg-slate-50 shrink-0"
              />
            ) : (
              <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-xl border border-dashed border-slate-300 bg-slate-50 text-slate-400">
                <Building2 className="h-8 w-8" aria-hidden="true" />
              </div>
            )}

            <div className="flex-1 space-y-2">
              <Label htmlFor="school-logo-upload">Upload School Logo (PNG, JPEG, WebP)</Label>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                <Input
                  id="school-logo-upload"
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  onChange={(e) => setLogoFile(e.target.files?.[0] ?? null)}
                  className="py-2 file:mr-3 file:rounded-md file:border-0 file:bg-slate-100 file:px-3 file:py-1 file:text-xs file:font-medium file:text-[#0F172A]"
                />
                <Button type="submit" disabled={!logoFile || uploadingLogo}>
                  <Upload className="h-4 w-4" aria-hidden="true" />
                  <span>{uploadingLogo ? 'Uploading...' : 'Save Logo'}</span>
                </Button>
              </div>
              {logoFile ? (
                <p className="text-xs text-slate-500">
                  Selected: {logoFile.name} ({formatBytes(logoFile.size)})
                </p>
              ) : null}
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Institutional Record</CardTitle>
          <CardDescription>
            Tenant Code: <span className="font-mono font-semibold">{profile?.code ?? '—'}</span> · Status:{' '}
            <span className="capitalize">{profile?.status.replace('_', ' ') ?? '—'}</span>
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-sm text-slate-500">Loading school profile...</p>
          ) : (
            <form onSubmit={handleSave} className="space-y-5">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="sp-name">Official School Name *</Label>
                  <Input
                    id="sp-name"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="sp-reg">Government / Accreditation Reg. No.</Label>
                  <Input
                    id="sp-reg"
                    value={registrationNumber}
                    onChange={(e) => setRegistrationNumber(e.target.value)}
                    placeholder="e.g., MOE-REG-40291"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="sp-email">Official Contact Email *</Label>
                  <Input
                    id="sp-email"
                    type="email"
                    required
                    value={contactEmail}
                    onChange={(e) => setContactEmail(e.target.value)}
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="sp-phone">Official Phone Number *</Label>
                  <Input
                    id="sp-phone"
                    required
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="sp-type">School Type</Label>
                  <Select
                    id="sp-type"
                    value={schoolType}
                    onChange={(e) => setSchoolType(e.target.value)}
                  >
                    <option value="Primary">Primary</option>
                    <option value="Secondary">Secondary</option>
                    <option value="Combined K-12">Combined K-12</option>
                    <option value="Nursery & Primary">Nursery &amp; Primary</option>
                    <option value="Technical & Vocational">Technical &amp; Vocational</option>
                    <option value="Other">Other</option>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="sp-ownership">Ownership Structure</Label>
                  <Select
                    id="sp-ownership"
                    value={schoolOwnership}
                    onChange={(e) => setSchoolOwnership(e.target.value)}
                  >
                    <option value="Private">Private</option>
                    <option value="Public">Public</option>
                    <option value="Mission / Faith-Based">Mission / Faith-Based</option>
                    <option value="Community">Community</option>
                    <option value="Federal / State">Federal / State</option>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="sp-country">Country *</Label>
                  <Input
                    id="sp-country"
                    required
                    value={country}
                    onChange={(e) => setCountry(e.target.value)}
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="sp-state">State / Province</Label>
                  <Input
                    id="sp-state"
                    value={state}
                    onChange={(e) => setState(e.target.value)}
                    placeholder="e.g., Lagos State"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="sp-city">City *</Label>
                  <Input
                    id="sp-city"
                    required
                    value={city}
                    onChange={(e) => setCity(e.target.value)}
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="sp-year">Established Year</Label>
                  <Input
                    id="sp-year"
                    type="number"
                    min={1800}
                    max={2100}
                    value={establishedYear}
                    onChange={(e) => setEstablishedYear(e.target.value)}
                    placeholder="e.g., 2012"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="sp-website">Website URL</Label>
                  <Input
                    id="sp-website"
                    value={website}
                    onChange={(e) => setWebsite(e.target.value)}
                    placeholder="https://yourschool.edu"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="sp-motto">School Motto</Label>
                  <Input
                    id="sp-motto"
                    value={motto}
                    onChange={(e) => setMotto(e.target.value)}
                    placeholder="Excellence, Integrity, Service"
                  />
                </div>

                <div className="space-y-1.5 md:col-span-2">
                  <Label htmlFor="sp-address">Physical Campus Address</Label>
                  <Input
                    id="sp-address"
                    value={physicalAddress}
                    onChange={(e) => setPhysicalAddress(e.target.value)}
                    placeholder="Street address, campus district, postal code"
                  />
                </div>

                <div className="space-y-1.5 md:col-span-2">
                  <Label htmlFor="sp-desc">Institutional Description</Label>
                  <textarea
                    id="sp-desc"
                    rows={3}
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Brief academic overview and accreditation summary..."
                    className="w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-[#0F172A] placeholder:text-slate-400 focus-visible:outline-none focus-visible:border-[#2563EB] focus-visible:ring-2 focus-visible:ring-[#2563EB]/20"
                  />
                </div>
              </div>

              <div className="flex justify-end">
                <Button type="submit" disabled={saving}>
                  {saving ? 'Saving Profile...' : 'Save School Profile'}
                </Button>
              </div>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
