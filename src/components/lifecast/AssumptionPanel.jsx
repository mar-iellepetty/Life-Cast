import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { DEFAULT_ASSUMPTIONS } from '@/lib/calcEngine';

// Assumption Inspector — every number in the model is editable, everything recalculates.
export default function AssumptionPanel({ open, onOpenChange, profile, assumptions, onProfileChange, onAssumptionsChange }) {
  const setProfile = (key, value) => onProfileChange({ ...profile, [key]: value });
  const setAssumption = (key, value) => onAssumptionsChange({ ...assumptions, [key]: value });

  const numField = (label, value, onChange, suffix) => (
    <div className="space-y-1.5">
      <Label className="text-xs text-[#2B1B12]/70">{label}</Label>
      <div className="flex items-center">
        <Input
          type="number"
          value={Number.isFinite(value) ? value : 0}
          onChange={(e) => onChange(Number(e.target.value))}
          className="border-[#E9E0D4] bg-[#FAF7F2] text-sm text-[#2B1B12] focus-visible:ring-[#E67E22]/40"
        />
        {suffix && <span className="ml-2 text-xs text-[#8A7A6B]">{suffix}</span>}
      </div>
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] max-w-xl overflow-y-auto border-[#E9E0D4] bg-white text-[#2B1B12]">
        <DialogHeader>
          <DialogTitle className="font-display text-xl text-[#4A1C1C]">Assumption Inspector</DialogTitle>
          <DialogDescription className="text-[#8A7A6B]">
            Every assumption behind your model — change one and everything recalculates.
          </DialogDescription>
        </DialogHeader>

        <p className="text-[10px] font-medium uppercase tracking-[0.2em] text-[#C96A18]">Your situation</p>
        <div className="mt-3 grid grid-cols-2 gap-4">
          {numField('Your age', profile.age, (v) => setProfile('age', v))}
          {numField('Your income', profile.primaryIncome, (v) => setProfile('primaryIncome', v), '/yr')}
          {numField('Spouse income', profile.spouseIncome, (v) => setProfile('spouseIncome', v), '/yr')}
          {numField('Mortgage balance', profile.mortgage, (v) => setProfile('mortgage', v))}
          {numField('Other debt', profile.otherDebt, (v) => setProfile('otherDebt', v))}
          {numField('Savings', profile.savings, (v) => setProfile('savings', v))}
          {numField('Existing coverage', profile.existingCoverage, (v) => setProfile('existingCoverage', v))}
          <div className="space-y-1.5">
            <Label className="text-xs text-[#2B1B12]/70">Dependent ages</Label>
            <Input
              value={profile.dependents.join(', ')}
              onChange={(e) =>
                setProfile(
                  'dependents',
                  e.target.value.split(',').filter((s) => s.trim()).map((s) => Number(s.trim())).filter((n) => Number.isFinite(n) && n >= 0)
                )
              }
              placeholder="4, 7"
              className="border-[#E9E0D4] bg-[#FAF7F2] text-sm text-[#2B1B12] focus-visible:ring-[#E67E22]/40"
            />
          </div>
        </div>

        <p className="mt-6 text-[10px] font-medium uppercase tracking-[0.2em] text-[#C96A18]">Engine assumptions</p>
        <div className="mt-3 grid grid-cols-2 gap-4">
          {numField('Income replacement period', assumptions.incomeYears ?? DEFAULT_ASSUMPTIONS.incomeYears, (v) => setAssumption('incomeYears', v), 'years')}
          {numField('After-tax dependence', Math.round((assumptions.afterTaxFactor ?? DEFAULT_ASSUMPTIONS.afterTaxFactor) * 100), (v) => setAssumption('afterTaxFactor', v / 100), '%')}
          {numField('Education goal per child', assumptions.educationPerChild ?? DEFAULT_ASSUMPTIONS.educationPerChild, (v) => setAssumption('educationPerChild', v))}
          {numField('Final-expenses buffer', assumptions.finalExpenses ?? DEFAULT_ASSUMPTIONS.finalExpenses, (v) => setAssumption('finalExpenses', v))}
        </div>
        <p className="mt-4 text-xs leading-relaxed text-[#8A7A6B]">
          These values are sent to CalcXML Ins01. The AI never sets them — it only reads and explains them.
        </p>
      </DialogContent>
    </Dialog>
  );
}