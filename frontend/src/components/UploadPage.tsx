import { useEffect, useState } from 'preact/hooks'
import { fetchDemo } from '../api'

interface Props {
  onSubmit: (sgf: string, visits: number) => void
  submitting: boolean
}

const VISIT_OPTIONS = [
  { value: 60, label: '快速(60 visits/手)' },
  { value: 120, label: '标准(120 visits/手)' },
  { value: 250, label: '精细(250 visits/手)' },
]

export default function UploadPage({ onSubmit, submitting }: Props) {
  const [sgf, setSgf] = useState('')
  const [visits, setVisits] = useState(120)
  const [demoMissing, setDemoMissing] = useState(false)

  useEffect(() => {
    // 记住上次的清晰度选择
    const saved = Number(localStorage.getItem('gotutor.visits'))
    if (saved && VISIT_OPTIONS.some((o) => o.value === saved)) setVisits(saved)
  }, [])

  function pickVisits(v: number) {
    setVisits(v)
    localStorage.setItem('gotutor.visits', String(v))
  }

  async function onFile(e: Event) {
    const file = (e.target as HTMLInputElement).files?.[0]
    if (!file) return
    setSgf(await file.text())
  }

  async function loadDemo() {
    try {
      setSgf(await fetchDemo())
      setDemoMissing(false)
    } catch {
      setDemoMissing(true)
    }
  }

  function submit() {
    if (sgf.trim()) onSubmit(sgf, visits)
  }

  return (
    <div class="upload">
      <div class="upload-card">
        <h1>上传棋谱,AI 帮你复盘</h1>
        <p class="upload-desc">
          支持 SGF 棋谱(19/13/9 路盘)。AI 会逐手计算胜率与失点,
          标出大失误、画出形势判断,帮你找到提升点。
        </p>
        <textarea
          class="sgf-input"
          placeholder="把 SGF 棋谱内容粘贴到这里,或选择下方文件…"
          value={sgf}
          onInput={(e) => setSgf((e.target as HTMLTextAreaElement).value)}
          rows={8}
        />
        <div class="upload-actions">
          <label class="btn btn-ghost">
            选择 SGF 文件
            <input type="file" accept=".sgf,text/plain" style="display:none" onChange={onFile} />
          </label>
          <button class="btn btn-ghost" onClick={loadDemo} disabled={submitting}>
            载入示例棋谱
          </button>
          <select value={visits} onChange={(e) => pickVisits(Number((e.target as HTMLSelectElement).value))}>
            {VISIT_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          <button class="btn btn-primary" onClick={submit} disabled={submitting || !sgf.trim()}>
            {submitting ? '引擎思考中…' : '开始 AI 复盘'}
          </button>
        </div>
        {demoMissing && <p class="hint">示例棋谱尚未生成(运行 scripts/gen_demo.py)</p>}
        <p class="hint">
          提示:分析在服务端 KataGo 上进行,手数越多、清晰度越高耗时越长;复盘可随时刷新页面回来继续看。
        </p>
      </div>
    </div>
  )
}
