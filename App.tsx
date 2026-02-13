
import React, { useState, useMemo, useRef, useEffect } from 'react';
import {
  Activity, Heart,
  ChevronRight, ArrowLeft, Download,
  Moon, Sun, Brain,
  TrendingDown, Target, ShieldAlert,
  Stethoscope, Microscope, Info, FileText, AlertTriangle, LayoutDashboard, Settings, Key
} from 'lucide-react';
import {
  CartesianGrid, XAxis, YAxis,
  ResponsiveContainer, AreaChart, Area, BarChart, Bar, Cell, LabelList, Tooltip as RechartsTooltip
} from 'recharts';
import OpenAI from "openai";
import { jsPDF } from "jspdf";
import html2canvas from "html2canvas";
import { MedicalData, Gender } from './types';
import { getCombinedResults, calculateOptimalRisk } from './services/riskCalculations';
import Tooltip from './components/Tooltip';

// Componente para Cards de Análise com animação
const AnimatedCard: React.FC<{ children: React.ReactNode; title: string; icon: any; color?: string; delay?: number }> = ({ children, title, icon: Icon, color = "text-indigo-600", delay = 0 }) => {
  const [show, setShow] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) {
        setTimeout(() => setShow(true), delay);
        observer.disconnect();
      }
    }, { threshold: 0.1 });
    if (ref.current) observer.observe(ref.current);
    return () => observer.disconnect();
  }, [delay]);

  return (
    <div ref={ref} className={`bg-white dark:bg-slate-900/60 p-6 rounded-[2rem] border border-slate-100 dark:border-slate-800 shadow-sm transition-all duration-1000 ${show ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-10'}`}>
      <div className="flex items-center gap-3 mb-6">
        <div className={`p-2 rounded-lg bg-slate-50 dark:bg-slate-800 ${color}`}><Icon size={18} /></div>
        <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">{title}</p>
      </div>
      {show && children}
    </div>
  );
};

const App: React.FC = () => {
  const [view, setView] = useState<'home' | 'calc' | 'results'>('home');
  const [step, setStep] = useState(1);
  const [darkMode, setDarkMode] = useState(false);
  const [aiInsight, setAiInsight] = useState<string | null>(null);
  const [isAiLoading, setIsAiLoading] = useState(false);
  const [patientId, setPatientId] = useState("");
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [provider, setProvider] = useState<'openai' | 'groq' | 'gemini'>(
    (localStorage.getItem('ai_provider') as any) || 'openai'
  );
  const [apiKeys, setApiKeys] = useState({
    openai: localStorage.getItem('openai_api_key') || '',
    groq: localStorage.getItem('groq_api_key') || '',
    gemini: localStorage.getItem('gemini_api_key') || ''
  });

  const saveApiKey = (key: string, prov: string) => {
    setApiKeys(prev => ({ ...prev, [prov]: key }));
    localStorage.setItem(`${prov}_api_key`, key);
  };

  const changeProvider = (prov: 'openai' | 'groq' | 'gemini') => {
    setProvider(prov);
    localStorage.setItem('ai_provider', prov);
  };

  const reportRef = useRef<HTMLDivElement>(null);

  const [formData, setFormData] = useState<MedicalData>({
    age: 50,
    gender: Gender.MALE,
    height: 180,
    weight: 103,
    bmi: 31.8,
    systolicBP: 145,
    diastolicBP: 92,
    totalCholesterol: 250,
    hdlCholesterol: 38,
    hasDiabetes: false,
    isSmoker: false,
    onHypertensionMeds: true,
    onStatins: false,
    eGFR: 56.4,
    acr: 175,
    useFullKfre: false
  });

  const results = useMemo(() => getCombinedResults(formData), [formData]);
  const optimal = useMemo(() => calculateOptimalRisk(formData), [formData]);

  const bmiValue = useMemo(() => {
    const hM = formData.height / 100;
    return parseFloat((formData.weight / (hM * hM)).toFixed(1));
  }, [formData.height, formData.weight]);

  const kdigoStage = useMemo(() => {
    let stage = "G1";
    let desc = "Normal ou Elevada";
    if (formData.eGFR < 15) { stage = "G5"; desc = "Falência Renal"; }
    else if (formData.eGFR < 30) { stage = "G4"; desc = "Severamente Reduzida"; }
    else if (formData.eGFR < 45) { stage = "G3b"; desc = "Moderada a Severa"; }
    else if (formData.eGFR < 60) { stage = "G3a"; desc = "Leve a Moderada"; }
    else if (formData.eGFR < 90) { stage = "G2"; desc = "Levemente Reduzida"; }

    let acrStage = "A1";
    if (formData.acr > 300) acrStage = "A3";
    else if (formData.acr > 30) acrStage = "A2";

    return { stage, desc, acrStage };
  }, [formData.eGFR, formData.acr]);

  const handleInputChange = (field: keyof MedicalData, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const generateAiInsight = async () => {
    setIsAiLoading(true);
    setAiInsight(null);
    try {
      const currentKey = apiKeys[provider] || import.meta.env[`VITE_${provider.toUpperCase()}_API_KEY`];

      if (!currentKey || currentKey === 'PLACEHOLDER_API_KEY') {
        alert(`Por favor, configure sua chave da ${provider.toUpperCase()} nas configurações para gerar o parecer.`);
        setIsAiLoading(false);
        return;
      }

      let baseURL = "https://api.openai.com/v1";
      let model = "gpt-4o";

      if (provider === 'groq') {
        baseURL = "https://api.groq.com/openai/v1";
        model = "llama-3.3-70b-versatile";
      } else if (provider === 'gemini') {
        baseURL = "https://generativelanguage.googleapis.com/v1beta/openai/";
        model = "gemini-2.0-flash";
      }

      const openai = new OpenAI({
        apiKey: currentKey,
        baseURL,
        dangerouslyAllowBrowser: true
      });

      const systemPrompt = "Você é um assistente médico especializado em análise de risco cardiovascular e renal crônico. Suas respostas devem ser precisas, baseadas em evidências e formatadas como laudos profissionais.";

      const userPrompt = `Você é um cardiologista e nefrologista sênior. Analise o seguinte perfil de risco cardiorrenal integrado e forneça um parecer técnico rico e detalhado em português.
      
      DADOS DO PACIENTE:
      - Idade: ${formData.age} anos, Sexo: ${formData.gender === Gender.MALE ? 'Masculino' : 'Feminino'}
      - IMC: ${bmiValue} kg/m²
      - PA: ${formData.systolicBP}/${formData.diastolicBP} mmHg (${formData.onHypertensionMeds ? 'Em tratamento' : 'Sem medicação'})
      - Lipídios: Colesterol Total ${formData.totalCholesterol}, HDL ${formData.hdlCholesterol} (${formData.onStatins ? 'Em uso de estatina' : 'Sem estatina'})
      - Função Renal: eGFR ${formData.eGFR} mL/min, ACR ${formData.acr} mg/g (KDIGO ${kdigoStage.stage}${kdigoStage.acrStage})
      - Riscos: ASCVD 10a ${results.cvTimeline.tenYear.toFixed(1)}%, KFRE 5a ${results.renalTimeline.fiveYear.toFixed(1)}%
      
      SOLICITAÇÃO:
      Forneça um laudo acadêmico dividido em:
      1. ANÁLISE DA INTERAÇÃO FISIOPATOLÓGICA (Explique como a albuminúria e a PA interagem neste caso).
      2. ESTRATIFICAÇÃO INTEGRADA (Combine PCE e KFRE).
      3. METAS E CONDUTA SUGERIDA (Baseada em AHA/ACC e KDIGO 2024).
      
      REGRAS: Use linguagem técnica. Não use asteriscos para negrito. Mantenha um tom profissional.`;

      const response = await openai.chat.completions.create({
        model,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt }
        ],
        temperature: 0.7,
      });

      const text = response.choices[0]?.message?.content || "Não foi possível gerar a análise no momento.";
      setAiInsight(text.replace(/\*\*/g, '').replace(/\*/g, '•'));
    } catch (error) {
      console.error("AI Error:", error);
      setAiInsight("Erro ao processar o parecer técnico. Verifique a chave da API e a conexão.");
    } finally {
      setIsAiLoading(false);
    }
  };

  const handleDownloadPDF = async () => {
    if (!reportRef.current) return;
    setIsGeneratingPdf(true);
    try {
      const canvas = await html2canvas(reportRef.current, { scale: 2, useCORS: true });
      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF('p', 'mm', 'a4');
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = (canvas.height * pdfWidth) / canvas.width;
      pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight);
      pdf.save(`CardioRenal_Report_${patientId || 'Paciente'}.pdf`);
    } catch (err) { console.error(err); } finally { setIsGeneratingPdf(false); }
  };

  const impactData = useMemo(() => [
    { name: 'PA', val: Number(((formData.systolicBP - 120) * 1.5).toFixed(1)), fill: '#ef4444' },
    { name: 'Lipídios', val: Number(((formData.totalCholesterol - 150) * 0.8).toFixed(1)), fill: '#f59e0b' },
    { name: 'UACR', val: Number((Math.log(formData.acr + 1) * 5).toFixed(1)), fill: '#10b981' }
  ].filter(d => d.val > 0), [formData]);

  const compareData = [
    { name: 'Atual', Risco: Number(results.cvTimeline.tenYear.toFixed(1)), fill: '#ef4444' },
    { name: 'Meta', Risco: Number(optimal.tenYear.toFixed(1)), fill: '#10b981' }
  ];

  return (
    <div className={`min-h-screen flex flex-col transition-all duration-500 ${darkMode ? 'dark bg-slate-950 text-slate-100' : 'bg-slate-50 text-slate-900'}`}>
      <nav className="sticky top-0 z-50 bg-white/90 dark:bg-slate-950/90 backdrop-blur-xl border-b border-slate-200/50 no-print h-20 flex items-center px-6">
        <div className="max-w-7xl mx-auto w-full flex justify-between items-center">
          <div onClick={() => setView('home')} className="flex items-center gap-3 cursor-pointer">
            <Activity className="text-indigo-600" size={24} />
            <span className="text-xl font-black tracking-tighter">CardioRenal<span className="text-indigo-600">Pro</span></span>
          </div>
          <div className="flex items-center gap-4">
            <button onClick={() => setDarkMode(!darkMode)} className="p-3 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
              {darkMode ? <Sun size={20} className="text-amber-400" /> : <Moon size={20} className="text-slate-500" />}
            </button>
            <button onClick={() => setShowSettings(!showSettings)} className="p-3 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors relative">
              <Settings size={20} className="text-slate-500" />
              {!apiKeys[provider] && <span className="absolute top-2 right-2 w-2 h-2 bg-red-500 rounded-full animate-pulse"></span>}
            </button>
            <button onClick={() => { setView('calc'); setStep(1); }} className="px-6 py-3 bg-indigo-600 text-white rounded-xl text-xs font-black uppercase tracking-widest shadow-xl">Novo Exame</button>
          </div>
        </div>
      </nav>

      {/* Settings Modal */}
      {showSettings && (
        <div className="fixed inset-0 z-[100] bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setShowSettings(false)}>
          <div className="bg-white dark:bg-slate-900 p-8 rounded-[2rem] shadow-2xl w-full max-w-md border border-slate-100 dark:border-slate-800" onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-3 mb-6">
              <div className="p-3 bg-indigo-50 dark:bg-indigo-900/30 rounded-xl">
                <Key className="text-indigo-600" size={24} />
              </div>
              <h3 className="text-xl font-black">Configurar IA Provider</h3>
            </div>

            <div className="flex bg-slate-100 dark:bg-slate-800 p-1 rounded-xl mb-6">
              {(['openai', 'groq', 'gemini'] as const).map(p => (
                <button
                  key={p}
                  onClick={() => changeProvider(p)}
                  className={`flex-1 py-2 rounded-lg text-xs font-black uppercase transition-all ${provider === p ? 'bg-white dark:bg-slate-700 shadow-sm text-indigo-600' : 'text-slate-400 hover:text-slate-600'}`}
                >
                  {p}
                </button>
              ))}
            </div>

            <p className="text-sm text-slate-500 mb-6 leading-relaxed">
              Insira sua chave de API para o provedor <strong>{provider.toUpperCase()}</strong>.
              {provider === 'groq' && <span className="block mt-2 text-indigo-500 font-bold">Recomendado: Gratuito e Ultrarrápido ⚡</span>}
            </p>

            <div className="space-y-4">
              <div>
                <label className="text-xs font-black text-slate-400 uppercase tracking-widest mb-2 block">API Key ({provider})</label>
                <input
                  type="password"
                  value={apiKeys[provider]}
                  onChange={(e) => saveApiKey(e.target.value, provider)}
                  placeholder={`Chave ${provider}...`}
                  className="w-full p-4 bg-slate-50 dark:bg-slate-800 rounded-xl font-bold border-2 border-slate-100 dark:border-slate-700 focus:border-indigo-500 outline-none transition-all text-sm"
                />
              </div>

              <button onClick={() => setShowSettings(false)} className="w-full py-4 bg-indigo-600 text-white rounded-xl font-black shadow-lg hover:bg-indigo-700 transition-all">
                Salvar e Fechar
              </button>

              <p className="text-[10px] text-center text-slate-400">
                Nunca compartilhe sua chave de API com ninguém.
              </p>
            </div>
          </div>
        </div>
      )}

      <main className="flex-grow">
        {view === 'home' && (
          <div className="flex flex-col items-center justify-center min-h-[80vh] text-center px-4 max-w-4xl mx-auto">
            <div className="w-24 h-24 bg-indigo-600 rounded-[2rem] flex items-center justify-center shadow-2xl mb-8 animate-pulse"><Heart className="text-white w-12 h-12" /></div>
            <h1 className="text-6xl font-black mb-6 tracking-tighter">Decisões <span className="text-indigo-600">Preditivas</span></h1>
            <p className="text-xl text-slate-500 mb-10 max-w-2xl leading-relaxed font-medium">Análise simultânea cardiovascular e renal para medicina de precisão.</p>
            <button onClick={() => setView('calc')} className="px-14 py-6 bg-indigo-600 text-white rounded-[2rem] font-bold text-lg flex items-center gap-3 hover:scale-105 transition-all shadow-2xl">Iniciar Módulo de Cálculo <ChevronRight size={24} /></button>
          </div>
        )}

        {view === 'calc' && (
          <div className="max-w-3xl mx-auto py-12 px-4">
            <div className="bg-white dark:bg-slate-900 rounded-[3rem] shadow-2xl p-10 md:p-14 border border-slate-100 dark:border-slate-800">
              <div className="mb-10 flex justify-between items-center">
                <h2 className="text-2xl font-black">Coleta de Biomarcadores</h2>
                <span className="text-[10px] font-black uppercase bg-indigo-100 text-indigo-600 px-4 py-1.5 rounded-full tracking-widest">Passo {step} / 3</span>
              </div>

              {step === 1 && (
                <div className="space-y-8 animate-in fade-in duration-500">
                  <div className="space-y-4">
                    <label className="text-xs font-black text-slate-400 uppercase tracking-widest">Identificação</label>
                    <input type="text" value={patientId} onChange={(e) => setPatientId(e.target.value)} className="w-full p-6 bg-slate-50 dark:bg-slate-800 border-none rounded-3xl font-bold outline-none ring-4 ring-slate-100 focus:ring-indigo-500 text-xl" placeholder="Nome ou Prontuário" />
                  </div>
                  <div className="grid grid-cols-2 gap-8">
                    <div className="space-y-4">
                      <label className="text-xs font-black text-slate-400 uppercase tracking-widest">Idade: {formData.age}a</label>
                      <input type="range" min="30" max="79" value={formData.age} onChange={(e) => handleInputChange('age', parseInt(e.target.value))} className="w-full h-4 bg-slate-200 rounded-2xl accent-indigo-600 cursor-pointer" />
                    </div>
                    <div className="space-y-4">
                      <label className="text-xs font-black text-slate-400 uppercase tracking-widest">Sexo</label>
                      <div className="flex gap-4">
                        <button onClick={() => handleInputChange('gender', Gender.MALE)} className={`flex-1 py-4 rounded-2xl font-black ${formData.gender === Gender.MALE ? 'bg-indigo-600 text-white shadow-lg' : 'bg-slate-100 text-slate-400'}`}>M</button>
                        <button onClick={() => handleInputChange('gender', Gender.FEMALE)} className={`flex-1 py-4 rounded-2xl font-black ${formData.gender === Gender.FEMALE ? 'bg-pink-600 text-white shadow-lg' : 'bg-slate-100 text-slate-400'}`}>F</button>
                      </div>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-8">
                    <div className="space-y-4">
                      <label className="text-xs font-black text-slate-400 uppercase tracking-widest">Altura (cm)</label>
                      <input type="number" value={formData.height} onChange={(e) => handleInputChange('height', parseInt(e.target.value))} className="w-full p-5 bg-slate-50 dark:bg-slate-800 rounded-2xl font-bold ring-4 ring-slate-100" />
                    </div>
                    <div className="space-y-4">
                      <label className="text-xs font-black text-slate-400 uppercase tracking-widest">Peso (kg)</label>
                      <input type="number" value={formData.weight} onChange={(e) => handleInputChange('weight', parseInt(e.target.value))} className="w-full p-5 bg-slate-50 dark:bg-slate-800 rounded-2xl font-bold ring-4 ring-slate-100" />
                    </div>
                  </div>
                </div>
              )}

              {step === 2 && (
                <div className="space-y-8 animate-in fade-in duration-500">
                  <div className="grid grid-cols-2 gap-6">
                    {['systolicBP', 'diastolicBP', 'totalCholesterol', 'hdlCholesterol'].map(k => (
                      <div key={k} className="space-y-3">
                        <label className="text-xs font-black text-slate-400 uppercase">{k.replace('BP', ' PA')}</label>
                        <input type="number" value={formData[k as keyof MedicalData] as number} onChange={(e) => handleInputChange(k as any, parseInt(e.target.value))} className="w-full p-5 bg-slate-50 rounded-2xl font-bold ring-4 ring-slate-100" />
                      </div>
                    ))}
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    {[{ l: 'Diabetes', k: 'hasDiabetes' }, { l: 'Fumante', k: 'isSmoker' }, { l: 'Tto PA', k: 'onHypertensionMeds' }, { l: 'Estatina', k: 'onStatins' }].map(i => (
                      <button key={i.k} onClick={() => handleInputChange(i.k as any, !formData[i.k as any])} className={`p-4 rounded-2xl font-black text-xs uppercase border-4 transition-all ${formData[i.k as any] ? 'border-indigo-600 bg-indigo-50 text-indigo-600 shadow-md' : 'border-slate-100 text-slate-400'}`}>{i.l}</button>
                    ))}
                  </div>
                </div>
              )}

              {step === 3 && (
                <div className="space-y-8 animate-in fade-in duration-500">
                  <div className="grid grid-cols-2 gap-6">
                    <div className="space-y-3">
                      <label className="text-xs font-black text-slate-400 uppercase">eGFR (mL/min)</label>
                      <input type="number" value={formData.eGFR} onChange={(e) => handleInputChange('eGFR', parseFloat(e.target.value))} className="w-full p-5 bg-slate-50 rounded-2xl font-bold ring-4 ring-slate-100" />
                    </div>
                    <div className="space-y-3">
                      <label className="text-xs font-black text-slate-400 uppercase">ACR (mg/g)</label>
                      <input type="number" value={formData.acr} onChange={(e) => handleInputChange('acr', parseFloat(e.target.value))} className="w-full p-5 bg-slate-50 rounded-2xl font-bold ring-4 ring-slate-100" />
                    </div>
                  </div>
                </div>
              )}

              <div className="mt-14 flex justify-between">
                <button disabled={step === 1} onClick={() => setStep(s => s - 1)} className="px-10 py-5 font-black text-slate-400 disabled:opacity-0">Voltar</button>
                {step < 3 ? (
                  <button onClick={() => setStep(s => s + 1)} className="px-14 py-5 bg-indigo-600 text-white rounded-[2rem] font-black shadow-2xl">Próximo</button>
                ) : (
                  <button onClick={() => setView('results')} className="px-16 py-6 bg-slate-900 text-white rounded-[2rem] font-black shadow-2xl">Gerar Análises</button>
                )}
              </div>
            </div>
          </div>
        )}

        {view === 'results' && (
          <div className="max-w-[1000px] mx-auto py-12 px-6 space-y-12">

            {/* DASHBOARD DE ANÁLISE INTERATIVA */}
            <div className="no-print space-y-8">
              <div className="flex justify-between items-center">
                <h2 className="text-3xl font-black tracking-tighter flex items-center gap-3"><LayoutDashboard className="text-indigo-600" /> Painel de Análise Clínica</h2>
                <div className="flex gap-4">
                  <button onClick={() => setView('calc')} className="px-6 py-3 border-2 border-slate-200 rounded-2xl font-bold text-slate-500 hover:bg-slate-50 transition-all">Editar Dados</button>
                  <button onClick={handleDownloadPDF} disabled={isGeneratingPdf} className="px-8 py-3 bg-indigo-600 text-white rounded-2xl font-bold shadow-lg hover:bg-indigo-700 transition-all flex items-center gap-2">
                    <Download size={18} /> Baixar Laudo Formal
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <AnimatedCard title="Projeção Cardiovascular (PCE 10a)" icon={Heart} color="text-red-500">
                  <div className="h-64 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={[{ n: '5a', r: results.cvTimeline.fiveYear }, { n: '10a', r: results.cvTimeline.tenYear }, { n: '15a', r: results.cvTimeline.fifteenYear }]} margin={{ top: 20, right: 30, left: 0, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} strokeOpacity={0.1} />
                        <XAxis dataKey="n" tick={{ fontSize: 12, fontWeight: 800 }} axisLine={false} tickLine={false} />
                        <YAxis hide />
                        <Area type="monotone" dataKey="r" stroke="#ef4444" fill="#ef444410" strokeWidth={5}>
                          <LabelList dataKey="r" position="top" offset={10} style={{ fill: '#ef4444', fontSize: 14, fontWeight: 900 }} formatter={(v: number) => `${v.toFixed(1)}%`} />
                        </Area>
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </AnimatedCard>

                <AnimatedCard title="Risco de Falência Renal (KFRE 5a)" icon={Activity} color="text-emerald-500" delay={200}>
                  <div className="h-64 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={[{ n: '2a', r: results.renalTimeline.twoYear }, { n: '5a', r: results.renalTimeline.fiveYear }, { n: '10a', r: results.renalTimeline.tenYear }]} margin={{ top: 20, right: 30, left: 0, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} strokeOpacity={0.1} />
                        <XAxis dataKey="n" tick={{ fontSize: 12, fontWeight: 800 }} axisLine={false} tickLine={false} />
                        <YAxis hide />
                        <Area type="monotone" dataKey="r" stroke="#10b981" fill="#10b98110" strokeWidth={5}>
                          <LabelList dataKey="r" position="top" offset={10} style={{ fill: '#10b981', fontSize: 14, fontWeight: 900 }} formatter={(v: number) => `${v.toFixed(1)}%`} />
                        </Area>
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </AnimatedCard>

                <AnimatedCard title="Fatores Agravantes (%)" icon={Target} color="text-indigo-500" delay={400}>
                  <div className="h-64 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart layout="vertical" data={impactData} margin={{ left: 20, right: 40, top: 10 }}>
                        <XAxis type="number" hide />
                        <YAxis dataKey="name" type="category" tick={{ fontSize: 11, fontWeight: 800 }} axisLine={false} tickLine={false} />
                        <Bar dataKey="val" radius={[0, 10, 10, 0]} barSize={24}>
                          {impactData.map((e, i) => <Cell key={i} fill={e.fill} />)}
                          <LabelList dataKey="val" position="right" offset={10} style={{ fill: '#64748b', fontSize: 12, fontWeight: 900 }} formatter={(v: number) => `${v}%`} />
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </AnimatedCard>

                <AnimatedCard title="Delta de Otimização" icon={TrendingDown} color="text-indigo-600" delay={600}>
                  <div className="h-64 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={compareData} margin={{ top: 20 }}>
                        <XAxis dataKey="name" tick={{ fontSize: 12, fontWeight: 800 }} axisLine={false} tickLine={false} />
                        <YAxis hide />
                        <Bar dataKey="Risco" radius={[10, 10, 0, 0]} barSize={60}>
                          {compareData.map((e, i) => <Cell key={i} fill={e.fill} />)}
                          <LabelList dataKey="Risco" position="top" offset={10} style={{ fill: '#64748b', fontSize: 14, fontWeight: 900 }} formatter={(v: number) => `${v.toFixed(1)}%`} />
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </AnimatedCard>
              </div>

              <div className="bg-slate-900 text-white p-10 rounded-[3rem] shadow-2xl relative overflow-hidden">
                <div className="absolute top-0 right-0 w-64 h-64 bg-indigo-500 blur-[120px] opacity-20 translate-x-1/2 -translate-y-1/2"></div>
                <div className="relative z-10 flex flex-col md:flex-row gap-10 items-center">
                  <div className="w-20 h-20 bg-white/10 rounded-3xl flex items-center justify-center shrink-0"><Brain className="text-indigo-300" size={40} /></div>
                  <div className="flex-grow space-y-4">
                    <h3 className="text-2xl font-black">Parecer Preditivo IA ({provider.toUpperCase()})</h3>
                    {aiInsight ? (
                      <div className="text-sm text-slate-300 leading-relaxed whitespace-pre-wrap font-medium">{aiInsight}</div>
                    ) : (
                      <p className="text-slate-400">Clique para gerar um parecer técnico detalhado integrando todos os biomarcadores coletados.</p>
                    )}
                  </div>
                  {!aiInsight && (
                    <button onClick={generateAiInsight} disabled={isAiLoading} className="px-10 py-5 bg-white text-slate-900 rounded-[2rem] font-black hover:bg-indigo-50 transition-all shrink-0 shadow-xl active:scale-95 disabled:opacity-50">
                      {isAiLoading ? 'Processando Raciocínio...' : 'Gerar Parecer Médico'}
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* DIVISOR */}
            <div className="no-print border-t-4 border-slate-100 dark:border-slate-800 pt-10 text-center">
              <span className="bg-slate-100 dark:bg-slate-800 px-8 py-2 rounded-full text-[10px] font-black uppercase tracking-widest text-slate-400 flex items-center gap-2 w-max mx-auto"><FileText size={14} /> Relatório de Referência Técnica</span>
            </div>

            {/* RELATÓRIO MÉDICO FORMAL (FORMATO DE REFERÊNCIA) */}
            <div ref={reportRef} className="bg-white text-slate-900 p-16 shadow-2xl border border-slate-200 min-h-[1120px] font-sans flex flex-col mx-auto w-full max-w-[800px]">

              <div className="bg-[#0f172a] text-white p-10 mb-10 -mx-16 -mt-16">
                <h1 className="text-4xl font-black mb-2">CardioRenal Risk Report</h1>
                <p className="text-lg opacity-80 mb-4">Relatório Integrado de Risco Cardiorrenal</p>
                <div className="text-[10px] opacity-60 flex gap-4 font-bold uppercase tracking-widest">
                  <span>Gerado em: {new Date().toLocaleString('pt-BR')}</span>
                  <span>Versão: 1.0.0-mvp</span>
                </div>
              </div>

              <section className="mb-10">
                <h2 className="text-xl font-black mb-4 border-b-2 border-slate-100 pb-2">1. Identificação do Paciente</h2>
                <div className="grid grid-cols-2 gap-4 text-[14px]">
                  <p><span className="font-bold">Nome:</span> {patientId || 'Luciano'}</p>
                  <p><span className="font-bold">Idade:</span> {formData.age} anos | <span className="font-bold">Sexo:</span> {formData.gender === Gender.MALE ? 'Masculino' : 'Feminino'}</p>
                  <p><span className="font-bold">Altura:</span> {formData.height} cm | <span className="font-bold">Peso:</span> {formData.weight} kg</p>
                  <p><span className="font-bold">IMC:</span> {bmiValue} kg/m²</p>
                </div>
              </section>

              <section className="mb-10">
                <h2 className="text-xl font-black mb-4 border-b-2 border-slate-100 pb-2">2. Risco Cardiovascular</h2>
                <div className="space-y-2 text-[14px]">
                  <p><span className="font-bold">Modelo:</span> Pooled Cohort Equations (ASCVD)</p>
                  <p><span className="font-bold">Risco em 10 anos:</span> <span className="text-red-600 font-black">{results.cvTimeline.tenYear.toFixed(1)}%</span></p>
                  <p><span className="font-bold">Risco em 5 anos:</span> {results.cvTimeline.fiveYear.toFixed(1)}%</p>
                  <p><span className="font-bold">Classificação:</span> {results.cvTimeline.tenYear < 5 ? 'Baixo' : results.cvTimeline.tenYear < 7.5 ? 'Limítrofe' : 'Elevado'}</p>
                  <p className="text-slate-500 italic text-[12px] mt-2">Risco ASCVD 10 anos de {results.cvTimeline.tenYear.toFixed(1)}% ({results.cvTimeline.tenYear < 5 ? '< 5%' : '> 5%'}). Classificação conforme ACC/AHA 2019.</p>
                </div>
              </section>

              <section className="mb-10">
                <h2 className="text-xl font-black mb-4 border-b-2 border-slate-100 pb-2">3. Avaliação Renal</h2>
                <div className="space-y-2 text-[14px]">
                  <p><span className="font-bold">TFG estimada (CKD-EPI 2021):</span> {formData.eGFR} mL/min/1.73m²</p>
                  <p><span className="font-bold">Estágio GFR:</span> {kdigoStage.stage} – {kdigoStage.desc}</p>
                  <p><span className="font-bold">Albuminúria:</span> {kdigoStage.acrStage} – {formData.acr < 30 ? 'A1' : formData.acr < 300 ? 'A2' : 'A3'}</p>
                  <p><span className="font-bold">Risco KDIGO:</span> <span className="font-bold text-red-600">Alto</span></p>
                  <p><span className="font-bold">KFRE – Risco de falência renal:</span> 2 anos: {results.renalTimeline.twoYear.toFixed(2)}% | 5 anos: {results.renalTimeline.fiveYear.toFixed(2)}%</p>
                </div>
              </section>

              <section className="mb-10">
                <h2 className="text-xl font-black mb-4 border-b-2 border-slate-100 pb-2">5. Principais Fatores de Risco</h2>
                <ul className="list-disc pl-5 space-y-2 text-[14px]">
                  {formData.totalCholesterol > 200 && (
                    <li><span className="font-bold">Colesterol total elevado:</span> {formData.totalCholesterol} mg/dL (desejável &lt; 200 mg/dL)</li>
                  )}
                  {formData.eGFR < 60 && (
                    <li><span className="font-bold">TFG reduzida:</span> eGFR de {formData.eGFR} mL/min/1.73m² (estágio {kdigoStage.stage})</li>
                  )}
                  {formData.acr > 30 && (
                    <li><span className="font-bold">Albuminúria:</span> ACR {formData.acr} mg/g ({kdigoStage.acrStage})</li>
                  )}
                </ul>
              </section>

              <section className="mb-10">
                <h2 className="text-xl font-black mb-4 border-b-2 border-slate-100 pb-2">6. Recomendações</h2>
                <ul className="list-disc pl-5 space-y-2 text-[14px]">
                  <li>LDL colesterol elevado – avaliar indicação de estatina com médico</li>
                  <li>Considerar IECA/BRA para nefroproteção (discutir com médico)</li>
                  <li>Encaminhamento a nefrologista para acompanhamento conjunto</li>
                  <li>Orientações de estilo de vida: dieta balanceada, atividade física regular, controle de peso</li>
                </ul>
              </section>

              {aiInsight && (
                <section className="mb-10 bg-slate-50 p-6 rounded-2xl border border-slate-100">
                  <h2 className="text-xl font-black mb-4 border-b-2 border-slate-200 pb-2 flex items-center gap-2"><Brain size={20} className="text-indigo-600" /> Parecer Técnico Preditivo</h2>
                  <div className="text-[12px] leading-relaxed text-slate-700 whitespace-pre-wrap italic">
                    {aiInsight}
                  </div>
                </section>
              )}

              <div className="flex-grow"></div>

              <div className="border-t pt-4 flex justify-between items-center text-[9px] text-slate-400 font-bold uppercase tracking-tighter">
                <span>CardioRenal Risk Report – Página 1/2</span>
                <span>Ferramenta de apoio – Não substitui consulta médica</span>
              </div>
            </div>

          </div>
        )}
      </main>

      <footer className="bg-slate-900 text-white py-6 px-10 border-t border-white/5 flex items-center justify-between no-print">
        <div className="flex items-center gap-3">
          <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse shadow-[0_0_10px_rgba(16,185,129,1)]" />
          <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Ambiente de Decisão Médica Ativo</span>
        </div>
        <p className="text-[10px] text-slate-500 font-bold uppercase tracking-tight italic opacity-60">Diretrizes AHA/ACC e KDIGO Integradas</p>
      </footer>
    </div >
  );
};

export default App;
