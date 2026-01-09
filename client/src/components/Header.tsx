import { motion } from 'framer-motion'
import { Cpu } from 'lucide-react'

export default function Header() {
  return (
    <header className="te-panel px-4 py-3">
      <div className="flex items-center justify-between">
        {/* Logo & Title */}
        <motion.div 
          className="flex items-center gap-4"
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.4 }}
        >
          {/* Logo mark */}
          <div className="w-12 h-12 rounded-lg bg-te-panel-dark border-2 border-te-border flex items-center justify-center relative overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-br from-te-fuchsia/20 to-transparent" />
            <Cpu className="w-6 h-6 text-te-fuchsia relative z-10" />
          </div>
          
          {/* Title block */}
          <div>
            <div className="flex items-center gap-3">
              <h1 className="font-mono text-lg font-bold tracking-wider text-te-cream uppercase">
                DESIGN<span className="text-te-fuchsia">_</span>FORGE
              </h1>
              {/* Status LED */}
              <div className="w-2 h-2 led led-green led-pulse" title="System Online" />
            </div>
            <p className="font-mono text-[10px] text-te-cream-muted tracking-widest uppercase mt-0.5">
              AI GENERATION CONSOLE v2.0
            </p>
          </div>
        </motion.div>
        
        {/* Right side - System Status */}
        <motion.div
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.4 }}
          className="flex items-center gap-4"
        >
          {/* System indicators */}
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <div className="w-1.5 h-1.5 led led-green led-pulse" />
              <span className="font-mono text-[9px] text-te-cream-muted uppercase tracking-wider">SYS</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-1.5 h-1.5 led led-amber led-pulse" />
              <span className="font-mono text-[9px] text-te-cream-muted uppercase tracking-wider">GPU</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-1.5 h-1.5 led led-green led-pulse" />
              <span className="font-mono text-[9px] text-te-cream-muted uppercase tracking-wider">NET</span>
            </div>
          </div>
          
          {/* Model badge */}
          <div className="te-badge bg-te-panel-dark border border-te-border">
            <div className="w-1.5 h-1.5 led led-green" />
            <span className="text-te-cream-muted">GEMINI PRO 3</span>
          </div>
        </motion.div>
      </div>
    </header>
  )
}
