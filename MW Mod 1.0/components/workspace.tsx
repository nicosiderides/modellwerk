'use client';
/* oxlint-disable react/react-compiler -- This imperative workspace synchronizes external navigation and saved revisions; it does not opt into React Compiler. */
/* oxlint-disable next/no-img-element -- Catalog WEBPs are preoptimized and QR images are data URLs; no remote image proxy is needed. */
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  Box,
  Check,
  CheckCheck,
  ChevronDown,
  ChevronRight,
  CircleAlert,
  CircleCheck,
  CircleHelp,
  Clock3,
  Download,
  FileBox,
  FileText,
  FolderKanban,
  Grid2X2,
  Layers3,
  List,
  LoaderCircle,
  MapPin,
  Minus,
  Plus,
  Printer,
  QrCode,
  Save,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  Upload,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  NativeSelect,
  NativeSelectOption,
} from '@/components/ui/native-select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { ModuleViewer, type ViewMode } from '@/components/module-viewer';
import {
  assemblySteps,
  dateLabel,
  defaultConfiguration,
  evaluate,
  money,
  options,
  products,
  type Asset,
  type Configuration,
  type Quote,
  type Workspace as WorkspaceData,
} from '@/lib/domain';
type Page =
  | 'overview'
  | 'projects'
  | 'catalog'
  | 'quotes'
  | 'factory'
  | 'bim'
  | 'project';
const navigation = [
  { id: 'overview', name: 'Vista general', icon: Grid2X2 },
  { id: 'projects', name: 'Proyectos', icon: FolderKanban },
  { id: 'catalog', name: 'Catálogo de sistemas', icon: Box },
  { id: 'quotes', name: 'Cotizaciones', icon: FileText },
  { id: 'factory', name: 'Fábrica y montaje', icon: Layers3 },
  { id: 'bim', name: 'Biblioteca BIM', icon: FileBox },
] as const;
const empty: WorkspaceData = {
  projects: [],
  quotes: [],
  assets: [],
  activity: [],
};
function saveFile(name: string, data: unknown) {
  const u = URL.createObjectURL(
    new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }),
  );
  const a = document.createElement('a');
  a.href = u;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(u), 1000);
}
function Revision({ value }: { value: number }) {
  return <span className="revision">R{String(value).padStart(2, '0')}</span>;
}
function Empty({
  title,
  text,
  action,
}: {
  title: string;
  text: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="empty-state">
      <FolderKanban size={30} />
      <h2>{title}</h2>
      <p>{text}</p>
      {action}
    </div>
  );
}
function Notice({
  children,
  danger = false,
}: {
  children: React.ReactNode;
  danger?: boolean;
}) {
  return (
    <div className={`notice ${danger ? 'danger' : ''}`}>
      <CircleAlert size={15} />
      <div>{children}</div>
    </div>
  );
}
export default function Workspace() {
  const [data, setData] = useState<WorkspaceData>(empty),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [toast, setToast] = useState('');
  const [page, setPage] = useState<Page>('overview'),
    [selectedId, setSelectedId] = useState('demo-campus'),
    [linkRevision, setLinkRevision] = useState<number | null>(null),
    [query, setQuery] = useState(''),
    [list, setList] = useState(false);
  const [draft, setDraft] = useState<Configuration>(defaultConfiguration()),
    [dirty, setDirty] = useState(false),
    [viewMode, setViewMode] = useState<ViewMode>('complete'),
    [part, setPart] = useState(''),
    [detailTab, setDetailTab] = useState('configuration');
  const [newOpen, setNewOpen] = useState(false),
    [helpOpen, setHelpOpen] = useState(false),
    [newProduct, setNewProduct] = useState('office'),
    [quote, setQuote] = useState<Quote | null>(null),
    [asset, setAsset] = useState<Asset | null>(null),
    [qr, setQr] = useState(''),
    [qrOpen, setQrOpen] = useState(false),
    [step, setStep] = useState(0);
  const fileInput = useRef<HTMLInputElement>(null);
  const current = data.projects.find((p) => p.id === selectedId);
  const currentProduct =
    products.find((p) => p.id === draft.product) || products[0];
  const evaluation = evaluate(draft);
  const announce = (message: string) => setToast(message);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(''), 4500);
    return () => clearTimeout(timer);
  }, [toast]);
  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const r = await fetch('/api/workspace');
      const result = (await r.json()) as WorkspaceData & { error?: string };
      if (!r.ok) throw new Error(result.error);
      setData(result);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo abrir el espacio.');
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);
  useEffect(() => {
    function read() {
      const params = new URLSearchParams(window.location.hash.slice(1));
      const p = params.get('view');
      if (p && [...navigation.map((n) => n.id), 'project'].includes(p as Page))
        setPage(p as Page);
      else setPage('overview');
      setSelectedId(params.get('id') || 'demo-campus');
      const revision = Number(params.get('rev'));
      setLinkRevision(revision > 0 ? revision : null);
    }
    read();
    window.addEventListener('hashchange', read);
    return () => window.removeEventListener('hashchange', read);
  }, []);
  useEffect(() => {
    if (current) {
      setDraft(current.configuration);
      setDirty(false);
      setPart('');
    }
  }, [current]);
  useEffect(() => {
    if (!dirty) return;
    const prevent = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener('beforeunload', prevent);
    return () => window.removeEventListener('beforeunload', prevent);
  }, [dirty]);
  function go(next: Page, id?: string) {
    if (busy) {
      announce('Esperá a que termine el guardado antes de cambiar de vista.');
      return;
    }
    if (
      dirty &&
      !window.confirm(
        'Tenés cambios sin guardar. ¿Querés descartarlos y continuar?',
      )
    )
      return;
    setDirty(false);
    if (current) setDraft(current.configuration);
    setViewMode('complete');
    setDetailTab('configuration');
    setStep(0);
    window.location.hash = new URLSearchParams({
      view: next,
      ...(id ? { id } : {}),
    }).toString();
  }
  function change(key: keyof Configuration, value: string | number) {
    setDraft((c) => ({ ...c, [key]: value }));
    setDirty(true);
  }
  const selectPart = useCallback((name: string) => setPart(name), []);
  async function mutate(action: string, fields: Record<string, unknown> = {}) {
    setBusy(true);
    try {
      const r = await fetch('/api/workspace', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action,
          id: current?.id,
          revision: current?.revision,
          ...fields,
        }),
      });
      const result = (await r.json()) as {
        workspace: WorkspaceData;
        projectId?: string;
        error?: string;
      };
      if (!r.ok) throw new Error(result.error);
      setData(result.workspace);
      return result as { workspace: WorkspaceData; projectId?: string };
    } catch (e) {
      announce(e instanceof Error ? e.message : 'No se pudo guardar.');
      return null;
    } finally {
      setBusy(false);
    }
  }
  async function save() {
    const r = await mutate('save', { configuration: draft });
    if (r) {
      setDirty(false);
      announce(
        'Nueva revisión guardada. Las estimaciones anteriores se conservan.',
      );
    }
  }
  async function generateQuote() {
    if (!current) return;
    if (dirty) {
      announce('Guardá la configuración antes de generar una estimación.');
      return;
    }
    const r = await mutate('quote');
    if (r) {
      setQuote(
        r.workspace.quotes.find((q) => q.projectId === current.id) || null,
      );
      announce('Estimación guardada con su configuración y precios.');
    }
  }
  async function newProject(e: React.SyntheticEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const r = await mutate('create', {
      name: f.get('name'),
      client: f.get('client'),
      location: f.get('location'),
      configuration: {
        ...defaultConfiguration(newProduct),
        quantity: Number(f.get('quantity')),
      },
    });
    if (r) {
      setNewOpen(false);
      setDirty(false);
      window.location.hash = new URLSearchParams({
        view: 'project',
        id: r.projectId!,
      }).toString();
      announce('Proyecto creado. Ya podés configurarlo.');
    }
  }
  async function upload(file?: File) {
    if (!file) return;
    setBusy(true);
    try {
      const form = new FormData();
      form.set('file', file);
      const r = await fetch('/api/assets', { method: 'POST', body: form });
      const result = (await r.json()) as { asset: Asset; error?: string };
      if (!r.ok) throw new Error(result.error);
      setData((d) => ({ ...d, assets: [result.asset, ...d.assets] }));
      setAsset(result.asset);
      announce('Archivo guardado y diagnóstico disponible.');
    } catch (e) {
      announce(
        e instanceof Error ? e.message : 'No se pudo importar el archivo.',
      );
    } finally {
      setBusy(false);
      if (fileInput.current) fileInput.current.value = '';
    }
  }
  async function openQR() {
    if (!current) return;
    try {
      const QRCode = await import('qrcode');
      const url = new URL(window.location.href);
      url.hash = new URLSearchParams({
        view: 'factory',
        id: current.id,
        rev: String(current.revision),
      }).toString();
      setQr(
        await QRCode.toDataURL(url.href, {
          width: 240,
          margin: 2,
          color: { dark: '#263e30', light: '#ffffff' },
        }),
      );
      setQrOpen(true);
    } catch {
      announce('No se pudo generar el QR.');
    }
  }
  const visibleProjects = data.projects.filter((p) =>
    `${p.name} ${p.client} ${p.location}`
      .toLowerCase()
      .includes(query.toLowerCase()),
  );
  const featured =
    data.projects.find((p) => p.id === 'demo-campus') || data.projects[0];
  function cards() {
    return (
      <div className="product-grid">
        {products.map((p) => (
          <button
            key={p.id}
            className="product-card"
            onClick={() => {
              setNewProduct(p.id);
              setNewOpen(true);
            }}
          >
            <div className="product-image">
              <img src={p.image} alt={`Referencia visual ${p.name}`} />
              <span className="product-code">
                {p.code} · {p.area} m²
              </span>
            </div>
            <div className="product-card-body">
              <div>
                <h3>{p.name}</h3>
                <p>{p.description}</p>
              </div>
              <ArrowUpRight size={19} />
            </div>
          </button>
        ))}
      </div>
    );
  }
  function heading(
    eyebrow: string,
    title: string,
    description: string,
    action?: React.ReactNode,
  ) {
    return (
      <div className="page-heading">
        <div>
          <div className="eyebrow">{eyebrow}</div>
          <h1>{title}</h1>
          <p>{description}</p>
        </div>
        {action}
      </div>
    );
  }
  const newButton = (
    <Button
      onClick={() => {
        setNewProduct('office');
        setNewOpen(true);
      }}
    >
      <Plus />
      Nuevo proyecto
    </Button>
  );
  return (
    <div className="workspace-shell">
      <aside className="sidebar">
        <a
          className="wordmark"
          href="#view=overview"
          aria-label="Modellwerk, vista general"
        >
          <picture>
            <source
              media="(max-width: 780px)"
              srcSet="/brand/mw-isotype.svg"
            />
            <img
              src="/brand/mw-lockup.svg"
              alt="MODELLWERK · PLATFORM"
              width={228}
              height={38}
              fetchPriority="high"
              decoding="sync"
            />
          </picture>
        </a>
        <div className="workspace-picker">
          <span className="workspace-avatar">M</span>
          <div>
            Modellwerk Studio<small>Espacio privado · Piloto</small>
          </div>
          <ChevronDown size={15} />
        </div>
        <span className="nav-caption">ESPACIO DE TRABAJO</span>
        <nav aria-label="Navegación principal">
          {navigation.map((n) => (
            <button
              key={n.id}
              title={n.name}
              aria-label={n.name}
              aria-current={
                page === n.id || (page === 'project' && n.id === 'projects')
                  ? 'page'
                  : undefined
              }
              onClick={() => go(n.id)}
              className={`nav-item ${page === n.id || (page === 'project' && n.id === 'projects') ? 'active' : ''}`}
            >
              <n.icon size={18} />
              <span>{n.name}</span>
              {n.id === 'projects' && (
                <span className="nav-count">{data.projects.length}</span>
              )}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="pilot-note">
            <ShieldCheck size={19} />
            <strong>Un producto, todo conectado.</strong>
            <p>Del primer modelo a la última pieza.</p>
            <span>MW MOD 1.0 · PILOTO</span>
          </div>
          <button
            className="nav-item"
            onClick={() => setHelpOpen(true)}
            aria-label="Guía de la plataforma"
          >
            <CircleHelp size={18} />
            <span>Guía de la plataforma</span>
          </button>
          <div className="account">
            <span className="person-avatar">MW</span>
            <div>
              Espacio de desarrollo<small>Datos de demostración</small>
            </div>
            <ShieldCheck size={17} />
          </div>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <div>
            Workspace <span>/</span>
            <strong>
              {page === 'project'
                ? current?.name
                : navigation.find((n) => n.id === page)?.name}
            </strong>
          </div>
          <div className="topbar-right">
            <button
              className="search-shortcut"
              aria-label="Buscar proyectos"
              onClick={() => go('projects')}
            >
              <Search size={15} />
              <span>Buscar un proyecto</span>
            </button>
            <span className="demo-indicator">Entorno de demostración</span>
            <span className="person-avatar small">MW</span>
          </div>
        </header>
        <main
          className={`page-content ${page === 'project' ? 'project-page' : ''}`}
        >
          {loading ? (
            <div className="loading-state">
              <LoaderCircle className="spin" />
              <p>Abriendo tu espacio de trabajo…</p>
            </div>
          ) : error ? (
            <Empty
              title="No se pudo abrir el espacio"
              text={error}
              action={<Button onClick={load}>Volver a intentar</Button>}
            />
          ) : (
            <>
              {(page === 'project' || page === 'factory') && !current && (
                <Empty
                  title="Proyecto no encontrado"
                  text="Este enlace no corresponde a un proyecto de tu espacio. No se abrió una revisión alternativa."
                  action={
                    <Button onClick={() => go('projects')}>
                      Ver mis proyectos
                    </Button>
                  }
                />
              )}
              {page === 'overview' && (
                <>
                  {heading(
                    'TU CONSTRUCCIÓN, CONECTADA',
                    'Todo empieza con un buen sistema.',
                    'Configurá, cotizá y llevá cada decisión hasta la fábrica.',
                    newButton,
                  )}
                  <div className="overview-stats">
                    {[
                      [
                        String(data.projects.length).padStart(2, '0'),
                        'Proyectos en tu espacio',
                      ],
                      ['03', 'Sistemas configurables'],
                      [
                        String(data.quotes.length).padStart(2, '0'),
                        'Estimaciones guardadas',
                      ],
                      ['00', 'Órdenes liberadas'],
                    ].map(([n, label]) => (
                      <div key={label}>
                        <span>{n}</span>
                        <p>{label}</p>
                      </div>
                    ))}
                  </div>
                  {featured && (
                    <section className="focus-project">
                      <div className="focus-copy">
                        <span className="eyebrow">CONTINUAR EXPLORANDO</span>
                        <span className="status-pill">En configuración</span>
                        <h2>{featured.name}</h2>
                        <p>
                          Una nueva forma de trabajar.
                          <br />
                          Un sistema. Todas las decisiones conectadas.
                        </p>
                        <div className="project-specs">
                          <span>
                            <strong>
                              {evaluate(featured.configuration).area}
                            </strong>{' '}
                            m²
                          </span>
                          <span>
                            <strong>
                              {String(featured.configuration.quantity).padStart(
                                2,
                                '0',
                              )}
                            </strong>{' '}
                            módulos
                          </span>
                          <Revision value={featured.revision} />
                        </div>
                        <Button onClick={() => go('project', featured.id)}>
                          Abrir proyecto
                          <ArrowUpRight />
                        </Button>
                        <small>
                          Proyecto de demostración · Valores no contractuales
                        </small>
                      </div>
                      <div className="focus-model">
                        <ModuleViewer
                          configuration={featured.configuration}
                          compact
                        />
                      </div>
                    </section>
                  )}
                  <div className="section-heading">
                    <div>
                      <h2>Tu biblioteca de posibilidades</h2>
                      <p>Sistemas preparados para convertirse en proyectos.</p>
                    </div>
                    <Button variant="ghost" onClick={() => go('catalog')}>
                      Explorar catálogo
                      <ArrowUpRight />
                    </Button>
                  </div>
                  {cards()}
                  <div className="overview-bottom">
                    <div>
                      <div className="section-heading">
                        <h2>Actividad del espacio</h2>
                        <Clock3 size={16} />
                      </div>
                      {data.activity.length ? (
                        data.activity.slice(0, 3).map((a) => (
                          <div className="activity-row" key={a.id}>
                            <span className="activity-dot" />
                            <div>
                              {a.message}
                              <small>{dateLabel(a.createdAt)}</small>
                            </div>
                          </div>
                        ))
                      ) : (
                        <p className="muted small-text">
                          Los cambios de tus proyectos aparecerán acá. Empezá
                          por abrir Campus Norte.
                        </p>
                      )}
                    </div>
                    <button
                      className="connection-card"
                      onClick={() => go('bim')}
                    >
                      <FileBox size={25} />
                      <div>
                        <h3>Tu información también tiene un lugar.</h3>
                        <p>Cargá un IFC o GLB y conocé su estado.</p>
                      </div>
                      <ArrowUpRight size={18} />
                    </button>
                  </div>
                </>
              )}
              {page === 'projects' && (
                <>
                  {heading(
                    'DE LA IDEA AL PROYECTO',
                    'Proyectos',
                    'Cada alternativa, con su configuración y sus revisiones.',
                    newButton,
                  )}
                  <div className="filter-bar">
                    <div className="search-field">
                      <Search size={16} />
                      <Input
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        placeholder="Buscar por proyecto, cliente o ubicación"
                        aria-label="Buscar proyectos"
                      />
                    </div>
                    <span>{visibleProjects.length} proyectos</span>
                    <div className="segmented">
                      <button
                        aria-label="Vista de tarjetas"
                        aria-pressed={!list}
                        className={!list ? 'selected' : ''}
                        onClick={() => setList(false)}
                      >
                        <Grid2X2 size={16} />
                      </button>
                      <button
                        aria-label="Vista de lista"
                        aria-pressed={list}
                        className={list ? 'selected' : ''}
                        onClick={() => setList(true)}
                      >
                        <List size={16} />
                      </button>
                    </div>
                  </div>
                  {visibleProjects.length ? (
                    <div
                      className={`projects-grid ${list ? 'list-layout' : ''}`}
                    >
                      {visibleProjects.map((p) => {
                        const product = products.find(
                          (x) => x.id === p.configuration.product,
                        )!;
                        return (
                          <button
                            className="project-card"
                            key={p.id}
                            onClick={() => go('project', p.id)}
                          >
                            <div className="project-thumbnail">
                              <img
                                src={product.image}
                                alt={`Referencia ${product.name}`}
                              />
                              <span className="status-pill">Borrador</span>
                              <Revision value={p.revision} />
                            </div>
                            <div className="project-card-details">
                              <div className="project-card-title">
                                <h2>{p.name}</h2>
                                <ArrowUpRight size={17} />
                              </div>
                              <p>{p.client}</p>
                              <small>
                                <MapPin size={12} />
                                {p.location}
                              </small>
                              <div className="project-card-footer">
                                <span>
                                  {p.configuration.quantity} módulos ·{' '}
                                  {evaluate(p.configuration).area} m²
                                </span>
                                <span>{product.code}</span>
                              </div>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  ) : (
                    <Empty
                      title="No encontramos proyectos"
                      text="Probá otra búsqueda o creá tu primer proyecto."
                      action={newButton}
                    />
                  )}
                </>
              )}
              {page === 'catalog' && (
                <>
                  {heading(
                    'BIBLIOTECA DE SISTEMAS',
                    'Diseñado para repetirse. Preparado para cambiar.',
                    'Elegí una familia para comenzar un nuevo proyecto.',
                  )}
                  <div className="catalog-intro">
                    <Layers3 size={24} />
                    <div>
                      <strong>
                        Un catálogo con reglas, materiales y precios conectados.
                      </strong>
                      <p>
                        Las tres familias de este piloto son demostrativas. La
                        ingeniería y los valores deben ser aprobados antes de un
                        uso comercial.
                      </p>
                    </div>
                    <span className="status-pill amber">Catálogo piloto</span>
                  </div>
                  {cards()}
                  <div className="section-heading">
                    <h2>Comparar sistemas</h2>
                    <span className="muted small-text">
                      Moneda de referencia: USD
                    </span>
                  </div>
                  <div className="table-wrap">
                    <table>
                      <thead>
                        <tr>
                          <th>Sistema</th>
                          <th>Superficie por módulo</th>
                          <th>Base demostrativa</th>
                          <th>Personalización</th>
                          <th>Estado</th>
                        </tr>
                      </thead>
                      <tbody>
                        {products.map((p) => (
                          <tr key={p.id}>
                            <td>
                              <strong>{p.name}</strong>
                              <small>{p.code}</small>
                            </td>
                            <td>{p.area} m²</td>
                            <td>{money(p.base)}</td>
                            <td>Envolvente, acabado y aberturas</td>
                            <td>
                              <span className="status-pill amber">
                                Pendiente de ingeniería
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <Notice>
                    Los importes son referencias de demostración, no una oferta.
                    Las imágenes del catálogo son referencias visuales; el
                    configurador utiliza geometría conceptual propia.
                  </Notice>
                </>
              )}
              {page === 'project' && current && (
                <>
                  <button className="back-link" onClick={() => go('projects')}>
                    <ArrowLeft size={13} />
                    Todos los proyectos
                  </button>
                  {heading(
                    `${currentProduct.code} · PROYECTO MODULAR`,
                    current.name,
                    `${current.client} · ${current.location}`,
                    <div className="heading-actions">
                      <Button
                        variant="outline"
                        disabled={busy || !dirty}
                        onClick={save}
                      >
                        {busy ? <LoaderCircle className="spin" /> : <Save />}
                        {dirty ? 'Guardar cambios' : 'Guardado'}
                      </Button>
                      <Button
                        onClick={generateQuote}
                        disabled={busy || dirty || evaluation.errors.length > 0}
                      >
                        <FileText />
                        Generar estimación
                      </Button>
                    </div>,
                  )}
                  <div className="project-topline">
                    <div>
                      <Revision value={current.revision} />
                      <span className="status-pill">Borrador de proyecto</span>
                      <span className="status-pill amber">
                        No liberado para fabricar
                      </span>
                    </div>
                    <span className={dirty ? 'unsaved' : 'muted'}>
                      {dirty
                        ? 'Cambios sin guardar'
                        : `Actualizado · ${dateLabel(current.updatedAt)}`}
                    </span>
                  </div>
                  <div
                    className="detail-tabs"
                    role="tablist"
                    aria-label="Información del proyecto"
                  >
                    {[
                      ['configuration', 'Configuración'],
                      ['components', 'Componentes'],
                      ['documents', 'Documentación'],
                      ['history', 'Revisiones'],
                    ].map(([id, name]) => (
                      <button
                        key={id}
                        role="tab"
                        aria-selected={detailTab === id}
                        className={detailTab === id ? 'active' : ''}
                        onClick={() => setDetailTab(id)}
                      >
                        {name}
                      </button>
                    ))}
                  </div>
                  {detailTab === 'configuration' && (
                    <>
                      <div className="config-layout">
                        <section className="viewer-panel">
                          <div className="viewer-toolbar">
                            <div className="segmented">
                              {[
                                ['complete', 'Modelo completo'],
                                ['structure', 'Estructura'],
                                ['exploded', 'Despiece visual'],
                              ].map(([id, label]) => (
                                <button
                                  key={id}
                                  aria-pressed={viewMode === id}
                                  className={viewMode === id ? 'selected' : ''}
                                  onClick={() => setViewMode(id as ViewMode)}
                                >
                                  {label}
                                </button>
                              ))}
                            </div>
                            <span>Vista conceptual</span>
                          </div>
                          <ModuleViewer
                            configuration={draft}
                            mode={viewMode}
                            onSelect={selectPart}
                          />
                          <div className="model-info">
                            <span>
                              <Box size={14} />
                              {part ||
                                'Seleccioná un elemento para identificarlo'}
                            </span>
                            <span>
                              {evaluation.area} m² · {draft.quantity} módulos
                            </span>
                          </div>
                        </section>
                        <aside
                          className="configuration-panel"
                          inert={busy}
                          aria-busy={busy}
                        >
                          <div className="panel-title">
                            <SlidersHorizontal size={16} />
                            <h2>Configurá tu sistema</h2>
                          </div>
                          <div className="config-field">
                            <label htmlFor="system">Sistema constructivo</label>
                            <NativeSelect
                              id="system"
                              value={draft.product}
                              onChange={(e) =>
                                change('product', e.target.value)
                              }
                            >
                              {products.map((p) => (
                                <NativeSelectOption key={p.id} value={p.id}>
                                  {p.name} · {p.area} m²
                                </NativeSelectOption>
                              ))}
                            </NativeSelect>
                          </div>
                          <div className="config-field">
                            <span className="field-caption">
                              Cantidad de módulos
                            </span>
                            <div className="quantity-control">
                              <Button
                                variant="outline"
                                size="icon"
                                aria-label="Quitar un módulo"
                                disabled={draft.quantity <= 1}
                                onClick={() =>
                                  change('quantity', draft.quantity - 1)
                                }
                              >
                                <Minus size={14} />
                              </Button>
                              <span>
                                {String(draft.quantity).padStart(2, '0')}
                              </span>
                              <Button
                                variant="outline"
                                size="icon"
                                aria-label="Agregar un módulo"
                                disabled={draft.quantity >= 12}
                                onClick={() =>
                                  change('quantity', draft.quantity + 1)
                                }
                              >
                                <Plus size={14} />
                              </Button>
                              <small>{evaluation.area} m² totales</small>
                            </div>
                          </div>
                          <div className="config-field">
                            <label htmlFor="arrangement">
                              Disposición conceptual
                            </label>
                            <NativeSelect
                              id="arrangement"
                              value={draft.layout}
                              onChange={(e) => change('layout', e.target.value)}
                            >
                              {options.layout.map((o) => (
                                <NativeSelectOption key={o.id} value={o.id}>
                                  {o.label}
                                </NativeSelectOption>
                              ))}
                            </NativeSelect>
                          </div>
                          {(['envelope', 'glazing'] as const).map((key) => (
                            <div className="config-field" key={key}>
                              <label htmlFor={key}>
                                {key === 'envelope'
                                  ? 'Envolvente'
                                  : 'Aberturas'}
                              </label>
                              <NativeSelect
                                id={key}
                                value={draft[key]}
                                onChange={(e) => change(key, e.target.value)}
                              >
                                {options[key].map((o) => (
                                  <NativeSelectOption key={o.id} value={o.id}>
                                    {o.label}
                                    {o.price
                                      ? ` (+${money(o.price)}/mód.)`
                                      : ''}
                                  </NativeSelectOption>
                                ))}
                              </NativeSelect>
                            </div>
                          ))}
                          <div className="config-field">
                            <label>
                              Terminación exterior{' '}
                              <small>
                                {
                                  options.finish.find(
                                    (o) => o.id === draft.finish,
                                  )?.label
                                }
                              </small>
                            </label>
                            <div className="swatches">
                              {options.finish.map((o) => (
                                <button
                                  key={o.id}
                                  aria-label={`Terminación ${o.label}`}
                                  aria-pressed={draft.finish === o.id}
                                  title={`${o.label} · ${o.price ? money(o.price) + '/mód.' : 'Incluido'}`}
                                  className={
                                    draft.finish === o.id ? 'selected' : ''
                                  }
                                  style={{ backgroundColor: o.color }}
                                  onClick={() => change('finish', o.id)}
                                >
                                  {draft.finish === o.id && <Check size={15} />}
                                </button>
                              ))}
                            </div>
                          </div>
                          <div className="live-estimate">
                            <span>ESTIMACIÓN DEL PROYECTO</span>
                            <strong>{money(evaluation.total)}</strong>
                            <small>
                              USD ·{' '}
                              {money(
                                Math.round(evaluation.total / evaluation.area),
                              )}
                              /m² · Sin impuestos
                            </small>
                          </div>
                        </aside>
                      </div>
                      {evaluation.errors.map((w) => (
                        <Notice key={w} danger>
                          {w}
                        </Notice>
                      ))}
                      <div className="project-bottom-grid">
                        <div className="health-card">
                          <ShieldCheck size={21} />
                          <div>
                            <h3>La información tiene un estado.</h3>
                            <p>
                              Visualizable <Check size={12} /> · Estimación demo{' '}
                              <Check size={12} /> · Fabricación pendiente
                            </p>
                          </div>
                          <Button
                            variant="ghost"
                            onClick={() => setDetailTab('documents')}
                          >
                            Ver pendientes
                            <ArrowRight />
                          </Button>
                        </div>
                        <Button
                          variant="outline"
                          onClick={() => go('factory', current.id)}
                        >
                          <Layers3 />
                          Abrir recorrido de fábrica
                          <ArrowUpRight />
                        </Button>
                      </div>
                      <Notice>
                        {evaluation.warnings[0]} {evaluation.warnings[1]}
                      </Notice>
                    </>
                  )}
                  {detailTab === 'components' && (
                    <>
                      <div className="section-heading">
                        <div>
                          <h2>Qué compone esta configuración</h2>
                          <p>
                            Partidas comerciales de referencia. No equivalen a
                            un despiece de fabricación.
                          </p>
                        </div>
                        <Button
                          variant="outline"
                          onClick={() =>
                            saveFile(`${current.name}-configuracion.json`, {
                              project: current,
                              draft,
                              unsaved: dirty,
                              evaluation,
                            })
                          }
                        >
                          <Download />
                          Exportar JSON
                        </Button>
                      </div>
                      <div className="table-wrap">
                        <table>
                          <thead>
                            <tr>
                              <th>Partida</th>
                              <th>Unidades</th>
                              <th>Referencia unitaria</th>
                              <th>Subtotal</th>
                              <th>Fuente</th>
                            </tr>
                          </thead>
                          <tbody>
                            {evaluation.lines.map((l) => (
                              <tr key={l.label}>
                                <td>
                                  <strong>{l.label}</strong>
                                </td>
                                <td>{l.quantity}</td>
                                <td>
                                  {l.unit ? money(l.unit) : 'Incluido en base'}
                                </td>
                                <td>{money(l.total)}</td>
                                <td>
                                  <span className="status-pill amber">
                                    Precio demo
                                  </span>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                          <tfoot>
                            <tr>
                              <td colSpan={3}>Total de referencia</td>
                              <td colSpan={2}>{money(evaluation.total)}</td>
                            </tr>
                          </tfoot>
                        </table>
                      </div>
                      <Notice>
                        Faltan cantidades de ingeniería, consumibles,
                        desperdicios y operaciones. Este listado no debe usarse
                        para comprar ni fabricar.
                      </Notice>
                    </>
                  )}
                  {detailTab === 'documents' && (
                    <>
                      <div className="document-grid">
                        {[
                          [
                            'Modelo conceptual',
                            'Disponible para explorar',
                            'ready',
                          ],
                          [
                            'Lista comercial',
                            'Calculada con precios de ejemplo',
                            'ready',
                          ],
                          [
                            'Planos de taller',
                            'Pendiente de documentación aprobada',
                            'pending',
                          ],
                          [
                            'Reglas de fabricación',
                            'Pendiente de validación de ingeniería',
                            'pending',
                          ],
                          [
                            'Cotización contractual',
                            'El piloto genera estimaciones no contractuales',
                            'pending',
                          ],
                          [
                            'Orden de producción',
                            'Bloqueada hasta implementar liberación técnica',
                            'pending',
                          ],
                        ].map(([name, desc, status]) => (
                          <div className="document-card" key={name}>
                            {status === 'ready' ? (
                              <CircleCheck size={22} />
                            ) : (
                              <Clock3 size={22} />
                            )}
                            <h3>{name}</h3>
                            <p>{desc}</p>
                            <span
                              className={`status-pill ${status === 'pending' ? 'amber' : ''}`}
                            >
                              {status === 'ready'
                                ? 'Referencia disponible'
                                : 'Pendiente'}
                            </span>
                          </div>
                        ))}
                      </div>
                      <Notice>
                        La biblioteca BIM conserva archivos de referencia del
                        espacio. En este piloto no se vinculan automáticamente
                        al proyecto ni se validan como documentos de
                        fabricación.
                      </Notice>
                      <Button variant="outline" onClick={() => go('bim')}>
                        <Upload />
                        Abrir biblioteca BIM
                      </Button>
                    </>
                  )}
                  {detailTab === 'history' && (
                    <>
                      <div className="section-heading">
                        <div>
                          <h2>Una revisión para cada decisión</h2>
                          <p>
                            Las estimaciones guardadas conservan la
                            configuración y los precios de su revisión.
                          </p>
                        </div>
                        <Revision value={current.revision} />
                      </div>
                      {data.quotes
                        .filter((q) => q.projectId === current.id)
                        .map((q) => (
                          <button
                            className="revision-row"
                            key={q.id}
                            onClick={() => setQuote(q)}
                          >
                            <Revision value={q.revision} />
                            <div>
                              <strong>Estimación de {q.projectName}</strong>
                              <small>
                                {dateLabel(q.createdAt)} ·{' '}
                                {q.configuration.quantity} módulos
                              </small>
                            </div>
                            <span>{money(q.evaluation.total)}</span>
                            <ArrowUpRight size={16} />
                          </button>
                        ))}
                      {!data.quotes.some((q) => q.projectId === current.id) && (
                        <Empty
                          title="Todavía no hay estimaciones guardadas"
                          text="Generá una estimación para conservar una copia de la configuración y sus precios."
                        />
                      )}
                      {data.activity
                        .filter((a) => a.message.includes(current.name))
                        .map((a) => (
                          <div className="activity-row" key={a.id}>
                            <span className="activity-dot" />
                            <div>
                              {a.message}
                              <small>{dateLabel(a.createdAt)}</small>
                            </div>
                          </div>
                        ))}
                    </>
                  )}
                </>
              )}
              {page === 'quotes' && (
                <>
                  {heading(
                    'DECISIONES QUE QUEDAN REGISTRADAS',
                    'Cotizaciones',
                    'Estimaciones versionadas. Lo guardado no cambia cuando cambia el proyecto.',
                    <Button onClick={() => go('projects')}>
                      <Plus />
                      Desde un proyecto
                    </Button>,
                  )}
                  {data.quotes.length ? (
                    <div className="table-wrap">
                      <table>
                        <thead>
                          <tr>
                            <th>Proyecto</th>
                            <th>Revisión</th>
                            <th>Fecha</th>
                            <th>Total de referencia</th>
                            <th>Estado</th>
                            <th aria-label="Acciones" />
                          </tr>
                        </thead>
                        <tbody>
                          {data.quotes.map((q) => (
                            <tr key={q.id}>
                              <td>
                                <strong>{q.projectName}</strong>
                                <small>{q.client}</small>
                              </td>
                              <td>
                                <Revision value={q.revision} />
                              </td>
                              <td>{dateLabel(q.createdAt)}</td>
                              <td>{money(q.evaluation.total)}</td>
                              <td>
                                <span className="status-pill amber">
                                  No contractual
                                </span>
                              </td>
                              <td>
                                <Button
                                  variant="ghost"
                                  onClick={() => setQuote(q)}
                                  aria-label={`Abrir estimación de ${q.projectName}`}
                                >
                                  <ArrowUpRight />
                                </Button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <Empty
                      title="Tu primera propuesta empieza en un proyecto"
                      text="Configurá un sistema, guardá los cambios y generá una estimación. Vas a encontrarla acá, con su revisión original."
                      action={
                        <Button onClick={() => go('project', featured?.id)}>
                          Explorar Campus Norte
                          <ArrowRight />
                        </Button>
                      }
                    />
                  )}
                </>
              )}
              {page === 'factory' && current && (
                <>
                  {heading(
                    'EL MODELO TAMBIÉN SE APRENDE',
                    'Fábrica y montaje',
                    'Un recorrido visual para comprender el sistema y su documentación.',
                    <Button variant="outline" onClick={openQR}>
                      <QrCode />
                      Ficha con QR
                    </Button>,
                  )}
                  <div className="factory-selector">
                    <label htmlFor="factory-project">
                      Proyecto de referencia
                    </label>
                    <NativeSelect
                      id="factory-project"
                      value={current.id}
                      onChange={(e) => go('factory', e.target.value)}
                    >
                      {data.projects.map((p) => (
                        <NativeSelectOption key={p.id} value={p.id}>
                          {p.name} · R{p.revision}
                        </NativeSelectOption>
                      ))}
                    </NativeSelect>
                    <Revision value={current.revision} />
                    <span className="status-pill amber">
                      Recorrido didáctico
                    </span>
                  </div>
                  {linkRevision && linkRevision !== current.revision && (
                    <Notice danger>
                      Este QR corresponde a R{linkRevision}; el proyecto ahora
                      está en R{current.revision}. No lo uses como instrucción
                      de trabajo.
                    </Notice>
                  )}
                  <div className="factory-layout">
                    <div className="steps-panel">
                      <span className="eyebrow">SECUENCIA DE APRENDIZAJE</span>
                      {assemblySteps.map((s, i) => (
                        <button
                          key={s.id}
                          className={`step-item ${i === step ? 'active' : ''}`}
                          onClick={() => setStep(i)}
                        >
                          <span className={current.checks[s.id] ? 'done' : ''}>
                            {current.checks[s.id] ? (
                              <Check size={13} />
                            ) : (
                              String(i + 1).padStart(2, '0')
                            )}
                          </span>
                          <div>
                            {s.name}
                            <small>
                              {current.checks[s.id]
                                ? 'Recorrido completado'
                                : 'Por explorar'}
                            </small>
                          </div>
                          <ChevronRight size={14} />
                        </button>
                      ))}
                      <div className="step-progress">
                        <span>
                          {
                            assemblySteps.filter((s) => current.checks[s.id])
                              .length
                          }{' '}
                          de 4 pasos explorados
                        </span>
                        <progress
                          max={4}
                          value={
                            assemblySteps.filter((s) => current.checks[s.id])
                              .length
                          }
                        />
                      </div>
                    </div>
                    <section className="factory-work">
                      <ModuleViewer
                        configuration={current.configuration}
                        mode={
                          assemblySteps[step].group === 'structure'
                            ? 'structure'
                            : step === 2
                              ? 'exploded'
                              : 'complete'
                        }
                      />
                      <div className="step-instruction">
                        <span className="eyebrow">
                          PASO {String(step + 1).padStart(2, '0')} / 04
                        </span>
                        <h2>{assemblySteps[step].name}</h2>
                        <p>{assemblySteps[step].detail}</p>
                        <Button
                          disabled={
                            busy ||
                            !!(
                              linkRevision && linkRevision !== current.revision
                            )
                          }
                          variant={
                            current.checks[assemblySteps[step].id]
                              ? 'outline'
                              : 'default'
                          }
                          onClick={async () => {
                            const result = await mutate('check', {
                              step: assemblySteps[step].id,
                              checked: !current.checks[assemblySteps[step].id],
                            });
                            if (result)
                              announce(
                                'Progreso de aprendizaje guardado. No es una aprobación de fabricación.',
                              );
                          }}
                        >
                          <CheckCheck />
                          {current.checks[assemblySteps[step].id]
                            ? 'Marcar como pendiente'
                            : 'Marcar como explorado'}
                        </Button>
                      </div>
                    </section>
                  </div>
                  <Notice>
                    Secuencia de demostración. No contiene instrucciones
                    técnicas aprobadas, no habilita fabricación y no certifica
                    calidad. Los cambios de configuración reinician este
                    recorrido.
                  </Notice>
                </>
              )}
              {page === 'bim' && (
                <>
                  {heading(
                    'LOS ARCHIVOS, CON CONTEXTO',
                    'Biblioteca BIM',
                    'Conservá tus referencias y conocé qué información traen.',
                    <Button
                      disabled={busy}
                      onClick={() => fileInput.current?.click()}
                    >
                      {busy ? <LoaderCircle className="spin" /> : <Upload />}
                      Importar modelo
                    </Button>,
                  )}
                  <div
                    className="upload-zone"
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={(e) => {
                      e.preventDefault();
                      if (!busy) void upload(e.dataTransfer.files[0]);
                    }}
                  >
                    <FileBox size={30} />
                    <h2>Un modelo es el punto de partida.</h2>
                    <p>
                      Arrastrá un IFC o GLB, o seleccioná un archivo.
                      <br />
                      Hasta 10 MB · Almacenamiento privado del espacio.
                    </p>
                    <Button
                      variant="outline"
                      disabled={busy}
                      onClick={() => fileInput.current?.click()}
                    >
                      {busy ? 'Analizando archivo…' : 'Seleccionar archivo'}
                    </Button>
                    <div>
                      <span>GLB · Visualización 3D</span>
                      <span>IFC · Diagnóstico básico, sin conversión 3D</span>
                    </div>
                  </div>
                  <input
                    ref={fileInput}
                    type="file"
                    accept=".glb,.ifc"
                    className="sr-only"
                    onChange={(e) => upload(e.target.files?.[0])}
                    aria-label="Archivo BIM para importar"
                  />
                  {data.assets.length > 0 && (
                    <>
                      <div className="section-heading">
                        <h2>Archivos del espacio</h2>
                        <span className="muted small-text">
                          {data.assets.length} referencias
                        </span>
                      </div>
                      <div className="table-wrap">
                        <table>
                          <thead>
                            <tr>
                              <th>Archivo</th>
                              <th>Formato</th>
                              <th>Tamaño</th>
                              <th>Diagnóstico</th>
                              <th aria-label="Acciones" />
                            </tr>
                          </thead>
                          <tbody>
                            {data.assets.map((a) => (
                              <tr key={a.id}>
                                <td>
                                  <strong>{a.name}</strong>
                                  <small>{dateLabel(a.createdAt)}</small>
                                </td>
                                <td>{a.report.schema}</td>
                                <td>{(a.bytes / 1024 / 1024).toFixed(2)} MB</td>
                                <td>
                                  <span className="status-pill amber">
                                    Pendiente de vinculación
                                  </span>
                                </td>
                                <td>
                                  <Button
                                    variant="ghost"
                                    onClick={() => setAsset(a)}
                                    aria-label={`Abrir ${a.name}`}
                                  >
                                    <ArrowUpRight />
                                  </Button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </>
                  )}
                  <Notice>
                    El diagnóstico IFC revisa encabezado y entidades. No
                    reemplaza una validación buildingSMART ni extrae un cómputo
                    de fabricación. Los archivos importados no alteran precios
                    ni reglas del catálogo.
                  </Notice>
                </>
              )}
            </>
          )}
          <footer className="page-footer">
            <span>MODELLWERK · CONSTRUCCIÓN INDUSTRIALIZADA</span>
            <span>Información clara. Decisiones conectadas.</span>
          </footer>
        </main>
      </div>
      <Dialog open={newOpen} onOpenChange={setNewOpen}>
        <DialogContent className="mw-dialog">
          <DialogHeader>
            <DialogTitle>Un nuevo proyecto empieza acá.</DialogTitle>
            <DialogDescription>
              Elegí un sistema y empezá a explorar sus posibilidades.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={newProject} className="new-project-form">
            <label htmlFor="new-name">
              Nombre del proyecto
              <Input
                name="name"
                id="new-name"
                required
                maxLength={100}
                placeholder="Ej. Oficinas Parque Sur"
              />
            </label>
            <label htmlFor="new-client">
              Cliente
              <Input
                name="client"
                id="new-client"
                required
                maxLength={100}
                placeholder="Empresa o persona de referencia"
              />
            </label>
            <label htmlFor="new-location">
              Ubicación
              <Input
                name="location"
                id="new-location"
                required
                maxLength={100}
                placeholder="Ciudad, provincia"
              />
            </label>
            <div className="form-grid">
              <label htmlFor="new-system">
                Sistema
                <NativeSelect
                  id="new-system"
                  value={newProduct}
                  onChange={(e) => setNewProduct(e.target.value)}
                >
                  {products.map((p) => (
                    <NativeSelectOption key={p.id} value={p.id}>
                      {p.name}
                    </NativeSelectOption>
                  ))}
                </NativeSelect>
              </label>
              <label htmlFor="new-quantity">
                Módulos
                <Input
                  name="quantity"
                  id="new-quantity"
                  type="number"
                  min={1}
                  max={12}
                  step={1}
                  defaultValue={1}
                  required
                />
              </label>
            </div>
            <Notice>
              Catálogo y precios de demostración. Podés cambiar las opciones
              dentro del proyecto.
            </Notice>
            <Button type="submit" disabled={busy}>
              {busy ? <LoaderCircle className="spin" /> : <Plus />}Crear
              proyecto
            </Button>
          </form>
        </DialogContent>
      </Dialog>
      <Dialog open={helpOpen} onOpenChange={setHelpOpen}>
        <DialogContent className="mw-dialog">
          <DialogHeader>
            <DialogTitle>Del sistema a la decisión.</DialogTitle>
            <DialogDescription>
              MW Mod 1.0 es una plataforma piloto independiente del visor
              original.
            </DialogDescription>
          </DialogHeader>
          <div className="guide-steps">
            {[
              [
                '01',
                'Configurá',
                'Abrí un proyecto o creá uno a partir del catálogo.',
              ],
              [
                '02',
                'Guardá una revisión',
                'Los cambios se guardan en la base de datos del espacio.',
              ],
              [
                '03',
                'Conservá una estimación',
                'Una copia fija de la configuración y los precios, imprimible o exportable.',
              ],
              [
                '04',
                'Explorá el sistema',
                'Identificá conjuntos en 3D y recorré una ficha didáctica con QR.',
              ],
            ].map(([n, title, desc]) => (
              <div key={n}>
                <span>{n}</span>
                <div>
                  <h3>{title}</h3>
                  <p>{desc}</p>
                </div>
              </div>
            ))}
          </div>
          <Notice>
            Este piloto no incluye ingeniería validada, roles empresariales,
            firma contractual ni liberación de producción. Los precios, reglas y
            geometría son demostrativos.
          </Notice>
        </DialogContent>
      </Dialog>
      <Dialog
        open={!!quote}
        onOpenChange={(open) => {
          if (!open) setQuote(null);
        }}
      >
        <DialogContent className="mw-dialog quote-dialog">
          <DialogHeader>
            <DialogTitle>Estimación de proyecto</DialogTitle>
            <DialogDescription>
              Una copia de la configuración al momento de generar la propuesta.
            </DialogDescription>
          </DialogHeader>
          {quote && (
            <>
              <article className="quote-document">
                <div className="quote-brand">
                  MODELLWERK<span>MW MOD 1.0</span>
                </div>
                <div className="quote-header">
                  <div>
                    <span className="eyebrow">ESTIMACIÓN NO CONTRACTUAL</span>
                    <h2>{quote.projectName}</h2>
                    <p>{quote.client}</p>
                  </div>
                  <Revision value={quote.revision} />
                </div>
                <div className="quote-meta">
                  <span>{dateLabel(quote.createdAt)}</span>
                  <span>
                    {quote.configuration.quantity} módulos ·{' '}
                    {quote.evaluation.area} m²
                  </span>
                </div>
                <table>
                  <thead>
                    <tr>
                      <th>Descripción</th>
                      <th>Cant.</th>
                      <th>Subtotal</th>
                    </tr>
                  </thead>
                  <tbody>
                    {quote.evaluation.lines.map((l) => (
                      <tr key={l.label}>
                        <td>{l.label}</td>
                        <td>{l.quantity}</td>
                        <td>{money(l.total)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div className="quote-total">
                  <span>Total de referencia · USD</span>
                  <strong>{money(quote.evaluation.total)}</strong>
                </div>
                <p className="quote-disclaimer">
                  Precios de demostración. No incluye impuestos, transporte,
                  fundaciones, montaje ni servicios profesionales. No constituye
                  una oferta ni autoriza fabricación.
                </p>
                <div className="quote-versions">
                  Catálogo: {quote.evaluation.catalogVersion}
                  <br />
                  Lista de precios: {quote.evaluation.priceVersion}
                  <br />
                  Referencia: {quote.id}
                </div>
              </article>
              <div className="dialog-actions">
                <Button
                  variant="outline"
                  onClick={() =>
                    saveFile(
                      `MW-estimacion-${quote.projectName}-R${quote.revision}.json`,
                      quote,
                    )
                  }
                >
                  <Download />
                  Exportar JSON
                </Button>
                <Button onClick={() => window.print()}>
                  <Printer />
                  Imprimir / PDF
                </Button>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
      <Dialog
        open={!!asset}
        onOpenChange={(open) => {
          if (!open) setAsset(null);
        }}
      >
        <DialogContent className="mw-dialog asset-dialog">
          <DialogHeader>
            <DialogTitle>{asset?.name}</DialogTitle>
            <DialogDescription>
              Archivo de referencia · Diagnóstico básico
            </DialogDescription>
          </DialogHeader>
          {asset && (
            <>
              {asset.kind === 'glb' && (
                <ModuleViewer
                  configuration={defaultConfiguration()}
                  assetUrl={`/api/assets?id=${encodeURIComponent(asset.id)}`}
                />
              )}
              <div className="diagnostic-stats">
                <div>
                  <strong>{asset.report.schema}</strong>
                  <span>Formato</span>
                </div>
                <div>
                  <strong>{asset.report.entities}</strong>
                  <span>
                    {asset.kind === 'ifc' ? 'Entidades declaradas' : 'Nodos'}
                  </span>
                </div>
                <div>
                  <strong>{asset.report.materials}</strong>
                  <span>Materiales declarados</span>
                </div>
              </div>
              {asset.report.warnings.map((w) => (
                <Notice key={w}>{w}</Notice>
              ))}
              <a
                className="download-link"
                href={`/api/assets?id=${encodeURIComponent(asset.id)}`}
                download={asset.name}
              >
                <Download size={15} />
                Descargar archivo original
              </a>
            </>
          )}
        </DialogContent>
      </Dialog>
      <Dialog open={qrOpen} onOpenChange={setQrOpen}>
        <DialogContent className="mw-dialog qr-dialog">
          <DialogHeader>
            <DialogTitle>El proyecto, a mano.</DialogTitle>
            <DialogDescription>
              Este QR abre el recorrido didáctico de {current?.name}, revisión R
              {current?.revision}.
            </DialogDescription>
          </DialogHeader>
          {qr && <img src={qr} alt="QR del recorrido de fábrica" />}
          <p>
            Requiere acceso al espacio privado. Si estás usando la versión
            local, el enlace solo funciona en este equipo.
          </p>
          <Notice>
            El QR identifica la revisión de referencia y advierte si el proyecto
            cambió. No es una orden de fabricación.
          </Notice>
          <a className="download-link" download="MW-ficha-QR.png" href={qr}>
            <Download size={15} />
            Descargar QR
          </a>
        </DialogContent>
      </Dialog>
      {toast && (
        <output className="toast-message" aria-live="polite">
          <CircleAlert size={17} />
          <span>{toast}</span>
          <button aria-label="Cerrar aviso" onClick={() => setToast('')}>
            <X size={15} />
          </button>
        </output>
      )}
    </div>
  );
}
