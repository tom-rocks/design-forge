import { motion } from 'framer-motion'
import { Sparkles } from 'lucide-react'

export default function Header() {
  return (
    <header className="flex items-center justify-between">
      <motion.div 
        className="flex items-center gap-3"
        initial={{ opacity: 0, x: -20 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.5 }}
      >
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-violet-500/20">
          <Sparkles className="w-5 h-5 text-white" />
        </div>
        <div>
          <h1 className="text-xl font-semibold text-forge-text tracking-tight">
            Design Forge
          </h1>
          <p className="text-xs text-forge-text-muted">
            Powered by Gemini Pro 3
          </p>
        </div>
      </motion.div>
      
      <motion.div
        initial={{ opacity: 0, x: 20 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.5 }}
        className="text-xs text-forge-text-muted"
      >
        via Krea API
      </motion.div>
    </header>
  )
}
