export interface User {
  id: number;
  name: string;
  email: string;
}

export interface Contact {
  id: number;
  name: string;
  email: string;
  phone: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  notes: string;
  created_at: string;
  updated_at: string;
  property_interests?: PropertyInterest[];
}

export interface Property {
  id: number;
  address: string;
  city: string;
  state: string;
  zip: string;
  price: number;
  bedrooms: number;
  bathrooms: number;
  sqft: number;
  photo_url: string;
  status: string;
  description: string;
  created_at: string;
  updated_at: string;
  interested_contacts?: InterestedContact[];
}

export interface Lead {
  id: number;
  contact_id: number;
  status: 'Hot' | 'Warm' | 'Cold' | 'Closed' | 'Follow-up Needed';
  source: string;
  notes: string;
  assigned_to: number | null;
  assigned_name: string | null;
  assigned_color: string | null;
  budget: string | null;
  project_lead_for: string | null;
  suggested_projects: string | null;
  location_looking: string | null;
  remarks: string | null;
  next_call_date: string | null;
  next_call_time: string | null;
  site_visit_plan: string | null;
  site_visit_date: string | null;
  lead_assign_date: string | null;
  assigned_by: string | null;
  buyer_purpose: string | null;
  final_meeting_date: string | null;
  final_meeting_notes: string | null;
  pattern: string | null;
  followup_date: string | null;
  followup_time: string | null;
  contact_name: string;
  contact_email: string;
  contact_phone: string;
  created_at: string;
  updated_at: string;
}

export interface Employee {
  id: number;
  name: string;
  email: string | null;
  phone: string | null;
  role: string;
  avatar_color: string;
  created_at: string;
}

export interface PropertyInterest {
  id: number;
  property_id: number;
  interest_level: string;
  address: string;
  city: string;
  price: number;
  bedrooms: number;
  bathrooms: number;
}

export interface InterestedContact {
  id: number;
  contact_id: number;
  interest_level: string;
  contact_name: string;
  contact_email: string;
}

export type LeadStatus = Lead['status'];

export interface CallLog {
  id: number;
  contact_id: number;
  lead_id: number | null;
  twilio_sid: string;
  from_number: string;
  to_number: string;
  direction: string;
  status: string;
  duration: number;
  notes: string | null;
  contact_name: string;
  contact_phone: string;
  created_at: string;
}
