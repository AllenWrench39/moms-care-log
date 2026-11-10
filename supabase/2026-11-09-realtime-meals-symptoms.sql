-- Lets the Today tab update live when someone else logs a meal or symptom.
-- Vitals, fluids and notes were already in the realtime publication; these two
-- were not. Safe to run once in the Supabase SQL editor. Until it is run, the
-- app still refreshes these whenever it is reopened or brought to the front.
alter publication supabase_realtime add table public.meals, public.day_symptoms;
