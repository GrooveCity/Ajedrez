import React, { useState, useEffect, useRef } from 'react';
import { Chess } from 'chess.js';
import Peer from 'peerjs';

// Símbolos de piezas vectoriales Unicode
const PIEZAS_UNICODE = {
  w: { p: '♙', r: '♖', n: '♘', b: '♗', q: '♕', k: '♔' },
  b: { p: '♟', r: '♜', n: '♞', b: '♝', q: '♛', k: '♚' }
};

// Banco de puzles
const PUZLES_BANCO = [
  {
    id: 1,
    titulo: "Mate en 1 (Pastor)",
    fen: "r1bqkb1r/pppp1ppp/2n2n2/4p2Q/2B1P3/8/PPPP1PPP/RNB1K1NR w KQkq - 4 4",
    solucion: { from: 'h5', to: 'f7' },
    pista: "Ataca la casilla f7 con la Dama."
  },
  {
    id: 2,
    titulo: "Ataque Doble de Caballo",
    fen: "r1bqk2r/pppp1ppp/2n5/4p3/2B1n3/2P2N2/PPP2PPP/R1BQ1RK1 w kq - 0 7",
    solucion: { from: 'c4', to: 'f7' },
    pista: "Sacrifica el Alfil en f7 para exponer al rey."
  },
  {
    id: 3,
    titulo: "Mate del Pasillo",
    fen: "6k1/5ppp/8/8/8/8/8/1R4K1 w - - 0 1",
    solucion: { from: 'b1', to: 'b8' },
    pista: "Aprovecha la primera fila descubierta con la Torre."
  }
];

// Motor de audio acústico
const reproducirSonido = (tipo) => {
  try {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return;
    const ctx = new AudioContext();

    if (tipo === 'mover') {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(120, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(30, ctx.currentTime + 0.05);
      gain.gain.setValueAtTime(0.3, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.05);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.05);
    } else if (tipo === 'comer') {
      const osc1 = ctx.createOscillator();
      const gain = ctx.createGain();
      osc1.type = 'sine';
      osc1.frequency.setValueAtTime(450, ctx.currentTime);
      osc1.frequency.exponentialRampToValueAtTime(80, ctx.currentTime + 0.08);
      gain.gain.setValueAtTime(0.4, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.08);
      osc1.connect(gain);
      gain.connect(ctx.destination);
      osc1.start();
      osc1.stop(ctx.currentTime + 0.08);
    } else if (tipo === 'click') {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.frequency.setValueAtTime(600, ctx.currentTime);
      gain.gain.setValueAtTime(0.04, ctx.currentTime);
      gain.gain.linearRampToValueAtTime(0.001, ctx.currentTime + 0.02);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.02);
    }
  } catch (e) {}
};

const evaluarMaterial = (gameInstance) => {
  const valores = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };
  let puntajeBlancas = 0;
  let puntajeNegras = 0;

  gameInstance.board().forEach(row => {
    row.forEach(piece => {
      if (piece) {
        if (piece.color === 'w') puntajeBlancas += valores[piece.type];
        else puntajeNegras += valores[piece.type];
      }
    });
  });

  const diferencia = puntajeBlancas - puntajeNegras;
  return Math.min(Math.max(50 + (diferencia * 5), 5), 95);
};

export default function App() {
  const [game, setGame] = useState(() => {
    const savedGame = localStorage.getItem('ajedrez_partida');
    const partida = new Chess();
    if (savedGame) {
      try { partida.load(savedGame); } catch (e) {}
    }
    return partida;
  });

  const [casillaSeleccionada, setCasillaSeleccionada] = useState(null);
  const [movimientosPosibles, setMovimientosPosibles] = useState([]);
  const [ultimoMovimiento, setUltimoMovimiento] = useState(null);
  const [piezasCapturadas, setPiezasCapturadas] = useState({ w: [], b: [] });
  const [casillaCapturaEfecto, setCasillaCapturaEfecto] = useState(null);
  
  const [modoJuego, setModoJuego] = useState('local'); // 'local' | 'cpu' | 'puzles' | 'online'
  const [estiloTablero, setEstiloTablero] = useState(() => localStorage.getItem('ajedrez_estilo') || 'madera');
  const [estiloPiezas, setEstiloPiezas] = useState(() => localStorage.getItem('ajedrez_piezas') || 'clasico');
  const [dimensionPiezas, setDimensionPiezas] = useState(() => localStorage.getItem('ajedrez_dimension') || '2d'); // '2d' | '3d'
  const [perspectivaNegra, setPerspectivaNegra] = useState(false);
  const [termometro, setTermometro] = useState(50);

  const [enPausa, setEnPausa] = useState(false);
  const [pensandoCpu, setPensandoCpu] = useState(false);

  // Puzles
  const [puzleActualIdx, setPuzleActualIdx] = useState(0);
  const [estadoPuzle, setEstadoPuzle] = useState('');

  // Relojes
  const [modoTiempo, setModoTiempo] = useState(300);
  const [tiempoBlancas, setTiempoBlancas] = useState(300);
  const [tiempoNegras, setTiempoNegras] = useState(300);
  const [finPorTiempo, setFinPorTiempo] = useState(null);

  // Multijugador PeerJS (Online)
  const [miPeerId, setMiPeerId] = useState('');
  const [codigoIngresado, setCodigoIngresado] = useState('');
  const [colorOnline, setColorOnline] = useState('w'); // 'w' para Anfitrión, 'b' para Invitado
  const [estadoOnline, setEstadoOnline] = useState('desconectado'); // 'desconectado' | 'creando' | 'esperando' | 'conectado'
  
  const peerInstance = useRef(null);
  const conexionRef = useRef(null);

  useEffect(() => {
    if (modoJuego !== 'puzles') {
      localStorage.setItem('ajedrez_partida', game.fen());
    }
    setTermometro(evaluarMaterial(game));
  }, [game, modoJuego]);

  useEffect(() => {
    localStorage.setItem('ajedrez_dimension', dimensionPiezas);
  }, [dimensionPiezas]);

  // Manejador del Reloj
  useEffect(() => {
    if (modoJuego === 'puzles' || modoTiempo === 0 || game.isGameOver() || finPorTiempo || enPausa) return;

    const timer = setInterval(() => {
      if (game.turn() === 'w') {
        setTiempoBlancas((t) => {
          if (t <= 1) {
            setFinPorTiempo('¡Las Negras ganan por tiempo! ⏱️');
            return 0;
          }
          return t - 1;
        });
      } else {
        setTiempoNegras((t) => {
          if (t <= 1) {
            setFinPorTiempo('¡Las Blancas ganan por tiempo! ⏱️');
            return 0;
          }
          return t - 1;
        });
      }
    }, 1000);

    return () => clearInterval(timer);
  }, [game, modoTiempo, finPorTiempo, modoJuego, enPausa]);

  // CPU IA
  useEffect(() => {
    if (modoJuego === 'cpu' && game.turn() === 'b' && !game.isGameOver() && !finPorTiempo && !enPausa) {
      setPensandoCpu(true);
      const tiempoPensamiento = Math.floor(Math.random() * 400) + 800;

      const timer = setTimeout(() => {
        const moves = game.moves({ verbose: true });
        if (moves.length > 0) {
          const movimientoAleatorio = moves[Math.floor(Math.random() * moves.length)];
          const res = game.move(movimientoAleatorio);
          
          if (res) {
            setUltimoMovimiento({ from: res.from, to: res.to });
            if (res.captured) {
              reproducirSonido('comer');
              setCasillaCapturaEfecto(res.to);
              setTimeout(() => setCasillaCapturaEfecto(null), 500);
              setPiezasCapturadas(prev => ({
                ...prev,
                [res.color]: [...prev[res.color], res.captured]
              }));
            } else {
              reproducirSonido('mover');
            }
            setGame(new Chess(game.fen()));
          }
        }
        setPensandoCpu(false);
      }, tiempoPensamiento);

      return () => clearTimeout(timer);
    }
  }, [game, modoJuego, finPorTiempo, enPausa]);

  // Configuración de PeerJS para Online
  const iniciarPeerJS = () => {
    if (peerInstance.current) return;

    const peer = new Peer();
    peer.on('open', (id) => {
      setMiPeerId(id);
    });

    peer.on('connection', (conn) => {
      conexionRef.current = conn;
      setEstadoOnline('conectado');
      setColorOnline('w');
      setPerspectivaNegra(false);
      configurarEventosConexion(conn);
    });

    peerInstance.current = peer;
  };

  const configurarEventosConexion = (conn) => {
    conn.on('data', (data) => {
      if (data.tipo === 'movimiento') {
        try {
          const nuevaPartida = new Chess(data.fen);
          setGame(nuevaPartida);
          setUltimoMovimiento(data.ultimoMovimiento);
          if (data.capturo) {
            reproducirSonido('comer');
            setCasillaCapturaEfecto(data.ultimoMovimiento?.to);
            setTimeout(() => setCasillaCapturaEfecto(null), 500);
          } else {
            reproducirSonido('mover');
          }
        } catch (e) {}
      } else if (data.tipo === 'reiniciar') {
        reiniciarPartidaLocal();
      }
    });

    conn.on('close', () => {
      setEstadoOnline('desconectado');
      alert('Tu oponente se ha desconectado.');
    });
  };

  const conectarASala = () => {
    if (!codigoIngresado || !peerInstance.current) return;
    const conn = peerInstance.current.connect(codigoIngresado.trim());
    conexionRef.current = conn;

    conn.on('open', () => {
      setEstadoOnline('conectado');
      setColorOnline('b');
      setPerspectivaNegra(true);
      configurarEventosConexion(conn);
    });
  };

  const manejarClickCasilla = (filaIdx, colIdx) => {
    if (enPausa || pensandoCpu) return;
    if (modoJuego === 'cpu' && game.turn() === 'b') return;
    if (modoJuego === 'online') {
      if (estadoOnline !== 'conectado') return;
      if (game.turn() !== colorOnline) return;
    }
    if (finPorTiempo) return;

    reproducirSonido('click');
    
    const columnas = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
    const filas = perspectivaNegra 
      ? ['1', '2', '3', '4', '5', '6', '7', '8'] 
      : ['8', '7', '6', '5', '4', '3', '2', '1'];
    
    const colReal = perspectivaNegra ? 7 - colIdx : colIdx;
    const filaReal = perspectivaNegra ? 7 - filaIdx : filaIdx;
    const coordenada = `${columnas[colReal]}${filas[filaReal]}`;

    if (casillaSeleccionada === null) {
      const pieza = game.get(coordenada);
      if (pieza && pieza.color === game.turn()) {
        setCasillaSeleccionada(coordenada);
        const moves = game.moves({ square: coordenada, verbose: true });
        setMovimientosPosibles(moves.map(m => m.to));
      }
    } else {
      if (modoJuego === 'puzles') {
        const puzleActual = PUZLES_BANCO[puzleActualIdx];
        if (casillaSeleccionada === puzleActual.solucion.from && coordenada === puzleActual.solucion.to) {
          game.move({ from: casillaSeleccionada, to: coordenada, promotion: 'q' });
          reproducirSonido('mover');
          setEstadoPuzle('correcto');
          setUltimoMovimiento({ from: casillaSeleccionada, to: coordenada });
          setGame(new Chess(game.fen()));
        } else {
          setEstadoPuzle('incorrecto');
        }
        setCasillaSeleccionada(null);
        setMovimientosPosibles([]);
        return;
      }

      try {
        const jugada = {
          from: casillaSeleccionada,
          to: coordenada,
          promotion: 'q'
        };
        const movimiento = game.move(jugada);

        if (movimiento) {
          const infoUltimoMov = { from: movimiento.from, to: movimiento.to };
          setUltimoMovimiento(infoUltimoMov);
          if (movimiento.captured) {
            reproducirSonido('comer');
            setCasillaCapturaEfecto(movimiento.to);
            setTimeout(() => setCasillaCapturaEfecto(null), 500);
            setPiezasCapturadas(prev => ({
              ...prev,
              [movimiento.color]: [...prev[movimiento.color], movimiento.captured]
            }));
          } else {
            reproducirSonido('mover');
          }
          
          const nuevoJuego = new Chess(game.fen());
          setGame(nuevoJuego);

          if (modoJuego === 'online' && conexionRef.current) {
            conexionRef.current.send({
              tipo: 'movimiento',
              fen: nuevoJuego.fen(),
              ultimoMovimiento: infoUltimoMov,
              capturo: !!movimiento.captured
            });
          }
        }
      } catch (e) {}
      setCasillaSeleccionada(null);
      setMovimientosPosibles([]);
    }
  };

  const reiniciarPartidaLocal = () => {
    setEnPausa(false);
    setPensandoCpu(false);
    setGame(new Chess());
    setCasillaSeleccionada(null);
    setMovimientosPosibles([]);
    setUltimoMovimiento(null);
    setPiezasCapturadas({ w: [], b: [] });
    setTiempoBlancas(modoTiempo);
    setTiempoNegras(modoTiempo);
    setFinPorTiempo(null);
    localStorage.removeItem('ajedrez_partida');
  };

  const reiniciarPartida = () => {
    reproducirSonido('click');
    reiniciarPartidaLocal();
    if (modoJuego === 'online' && conexionRef.current) {
      conexionRef.current.send({ tipo: 'reiniciar' });
    }
  };

  const cambiarModoJuego = (nuevoModo) => {
    setModoJuego(nuevoModo);
    reiniciarPartidaLocal();
    if (nuevoModo === 'online') {
      iniciarPeerJS();
    }
  };

  const formatearTiempo = (segundos) => {
    if (segundos === 0 && modoTiempo === 0) return '∞';
    const m = Math.floor(segundos / 60);
    const s = segundos % 60;
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  let board = game.board();
  if (perspectivaNegra) {
    board = board.map(row => [...row].reverse()).reverse();
  }

  const temasTablero = {
    madera: { clara: '#e0c097', oscura: '#8d5b4c', borde: '#5c3a21', mesa: '#111827' },
    clasico: { clara: '#eeeed2', oscura: '#769656', borde: '#385124', mesa: '#0f172a' },
    marfil: { clara: '#f0d9b5', oscura: '#b58863', borde: '#6e4f32', mesa: '#18181b' }
  };

  const coloresPiezas = {
    clasico: { w: '#ffffff', b: '#111111' },
    neon: { w: '#38bdf8', b: '#f43f5e' },
    dorado: { w: '#facc15', b: '#1e293b' }
  };

  const temaActual = temasTablero[estiloTablero];
  const coloresActuales = coloresPiezas[estiloPiezas];
  const es3D = dimensionPiezas === '3d';

  return (
    <div style={{
      backgroundColor: temaActual.mesa,
      color: '#f8fafc',
      minHeight: '100vh',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      padding: '16px 8px',
      fontFamily: 'system-ui, -apple-system, sans-serif',
      boxSizing: 'border-box'
    }}>
      
      {/* Título Principal */}
      <h1 style={{ fontSize: '1.5rem', margin: '0 0 12px 0', fontWeight: 'bold', color: '#f8fafc' }}>
        ♔ Ajedrez Pro {es3D && '3D'}
      </h1>

      {/* Selector de Modo */}
      <div style={{ display: 'flex', gap: '6px', maxWidth: '440px', width: '100%', marginBottom: '12px' }}>
        <button onClick={() => cambiarModoJuego('local')} style={{ flex: 1, padding: '8px', borderRadius: '8px', border: 'none', background: modoJuego === 'local' ? '#3b82f6' : '#1e293b', color: '#fff', fontWeight: 'bold', fontSize: '0.8rem', cursor: 'pointer' }}>👥 Local</button>
        <button onClick={() => cambiarModoJuego('cpu')} style={{ flex: 1, padding: '8px', borderRadius: '8px', border: 'none', background: modoJuego === 'cpu' ? '#3b82f6' : '#1e293b', color: '#fff', fontWeight: 'bold', fontSize: '0.8rem', cursor: 'pointer' }}>🤖 CPU</button>
        <button onClick={() => cambiarModoJuego('puzles')} style={{ flex: 1, padding: '8px', borderRadius: '8px', border: 'none', background: modoJuego === 'puzles' ? '#3b82f6' : '#1e293b', color: '#fff', fontWeight: 'bold', fontSize: '0.8rem', cursor: 'pointer' }}>🧩 Puzles</button>
        <button onClick={() => cambiarModoJuego('online')} style={{ flex: 1, padding: '8px', borderRadius: '8px', border: 'none', background: modoJuego === 'online' ? '#3b82f6' : '#1e293b', color: '#fff', fontWeight: 'bold', fontSize: '0.8rem', cursor: 'pointer' }}>🌐 Online</button>
      </div>

      {/* Ajustes Estéticos: Incluye Selector de Modo 2D/3D */}
      <div style={{ display: 'flex', gap: '6px', maxWidth: '440px', width: '100%', marginBottom: '10px' }}>
        <select value={estiloTablero} onChange={(e) => setEstiloTablero(e.target.value)} style={{ flex: 1, background: '#1e293b', color: '#fff', border: '1px solid #334155', padding: '6px', borderRadius: '6px', fontSize: '0.75rem' }}>
          <option value="madera">🪵 Madera</option>
          <option value="clasico">🟩 Verde</option>
          <option value="marfil">🦴 Marfil</option>
        </select>

        <select value={estiloPiezas} onChange={(e) => setEstiloPiezas(e.target.value)} style={{ flex: 1, background: '#1e293b', color: '#fff', border: '1px solid #334155', padding: '6px', borderRadius: '6px', fontSize: '0.75rem' }}>
          <option value="clasico">🎨 Clásico</option>
          <option value="neon">⚡ Neón</option>
          <option value="dorado">👑 Dorado</option>
        </select>

        {/* Configuración Piezas 2D vs 3D */}
        <select value={dimensionPiezas} onChange={(e) => setDimensionPiezas(e.target.value)} style={{ flex: 1, background: '#1e293b', color: '#fff', border: '1px solid #334155', padding: '6px', borderRadius: '6px', fontSize: '0.75rem', fontWeight: 'bold' }}>
          <option value="2d">🎭 Piezas 2D</option>
          <option value="3d">🧊 Piezas 3D</option>
        </select>

        <button onClick={() => setEnPausa(!enPausa)} style={{ background: enPausa ? '#10b981' : '#f59e0b', color: '#000', border: 'none', padding: '6px 10px', borderRadius: '6px', fontSize: '0.75rem', fontWeight: 'bold', cursor: 'pointer' }}>{enPausa ? '▶️' : '⏸️'}</button>
        <button onClick={() => setPerspectivaNegra(!perspectivaNegra)} style={{ background: '#1e293b', color: '#fff', border: '1px solid #334155', padding: '6px 10px', borderRadius: '6px', fontSize: '0.75rem', cursor: 'pointer' }}>🔄</button>
      </div>

      {/* Panel Multijugador Online */}
      {modoJuego === 'online' && (
        <div style={{ maxWidth: '440px', width: '100%', background: '#1e293b', padding: '12px', borderRadius: '10px', marginBottom: '10px', boxSizing: 'border-box', fontSize: '0.85rem' }}>
          {estadoOnline === 'conectado' ? (
            <div style={{ color: '#10b981', fontWeight: 'bold', textAlign: 'center' }}>
              🟢 Conectado con tu rival ({colorOnline === 'w' ? 'Jugás con Blancas ⚪' : 'Jugás con Negras ⚫'})
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <div>
                <span style={{ color: '#94a3b8' }}>Tu Código de Sala: </span>
                <strong style={{ color: '#facc15', fontSize: '0.95rem' }}>{miPeerId || 'Generando...'}</strong>
                {miPeerId && (
                  <button onClick={() => navigator.clipboard.writeText(miPeerId)} style={{ marginLeft: '8px', background: '#334155', color: '#fff', border: 'none', padding: '2px 8px', borderRadius: '4px', cursor: 'pointer', fontSize: '0.75rem' }}>📋 Copiar</button>
                )}
              </div>
              <div style={{ display: 'flex', gap: '6px' }}>
                <input 
                  type="text" 
                  placeholder="Pegar código de amigo..." 
                  value={codigoIngresado} 
                  onChange={(e) => setCodigoIngresado(e.target.value)}
                  style={{ flex: 1, padding: '6px', borderRadius: '6px', border: '1px solid #334155', background: '#0f172a', color: '#fff', fontSize: '0.8rem' }}
                />
                <button onClick={conectarASala} style={{ background: '#3b82f6', color: '#fff', border: 'none', padding: '6px 12px', borderRadius: '6px', fontWeight: 'bold', cursor: 'pointer', fontSize: '0.8rem' }}>Unirse</button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Relojes y Turno */}
      <div style={{ marginBottom: '10px', maxWidth: '440px', width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#1e293b', padding: '8px 12px', borderRadius: '10px', border: '1px solid #334155', boxSizing: 'border-box' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.85rem', color: game.turn() === 'b' ? '#38bdf8' : '#94a3b8' }}>
          <span>⚫ Negras</span>
          <span style={{ background: '#0f172a', padding: '2px 6px', borderRadius: '4px', fontFamily: 'monospace' }}>{formatearTiempo(tiempoNegras)}</span>
        </div>

        <div style={{ fontSize: '0.8rem', textAlign: 'center', fontWeight: 'bold' }}>
          {enPausa ? <span style={{ color: '#f59e0b' }}>PAUSADO</span> : pensandoCpu ? <span style={{ color: '#38bdf8' }}>🧠 Pensando...</span> : <span>Turno: {game.turn() === 'w' ? '⚪' : '⚫'}</span>}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.85rem', color: game.turn() === 'w' ? '#facc15' : '#94a3b8' }}>
          <span style={{ background: '#0f172a', padding: '2px 6px', borderRadius: '4px', fontFamily: 'monospace' }}>{formatearTiempo(tiempoBlancas)}</span>
          <span>⚪ Blancas</span>
        </div>
      </div>

      {/* Tablero con Respuesta Visual según Selección 2D o 3D */}
      <div style={{ display: 'flex', gap: '8px', maxWidth: '440px', width: '100%', alignItems: 'center', perspective: '900px' }}>
        <div style={{ width: '10px', height: '340px', backgroundColor: '#334155', borderRadius: '6px', overflow: 'hidden', display: 'flex', flexDirection: 'column', flexShrink: 0 }}>
          <div style={{ width: '100%', height: `${100 - termometro}%`, backgroundColor: '#0f172a', transition: 'height 0.3s ease' }} />
          <div style={{ width: '100%', height: `${termometro}%`, backgroundColor: '#f8fafc', transition: 'height 0.3s ease' }} />
        </div>

        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', transition: 'transform 0.5s ease', transform: es3D ? 'rotateX(22deg) rotateY(0deg) scale(1.05)' : 'rotateX(0deg) scale(1)', transformStyle: 'preserve-3d' }}>
          <div style={{ backgroundColor: temaActual.borde, padding: '6px', borderRadius: '10px', boxShadow: es3D ? '0 25px 45px rgba(0,0,0,0.7), 0 0 20px rgba(59, 130, 246, 0.2)' : '0 10px 25px rgba(0,0,0,0.5)', width: '100%', boxSizing: 'border-box', transition: 'box-shadow 0.5s ease' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(8, 1fr)', gridTemplateRows: 'repeat(8, 1fr)', width: '100%', aspectRatio: '1 / 1', borderRadius: '4px', overflow: 'hidden' }}>
              {board.map((row, rowIndex) =>
                row.map((square, colIndex) => {
                  const columnas = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
                  const filas = ['8', '7', '6', '5', '4', '3', '2', '1'];
                  
                  const rIdx = perspectivaNegra ? 7 - rowIndex : rowIndex;
                  const cIdx = perspectivaNegra ? 7 - colIndex : colIndex;
                  const coordenada = `${columnas[cIdx]}${filas[rIdx]}`;
                  
                  const esCasillaOscura = (rowIndex + colIndex) % 2 === 1;
                  const colorCasilla = esCasillaOscura ? temaActual.oscura : temaActual.clara;
                  const estaSeleccionada = casillaSeleccionada === coordenada;
                  const esMovimientoPosible = movimientosPosibles.includes(coordenada);
                  const esUltimoMovimiento = ultimoMovimiento && (ultimoMovimiento.from === coordenada || ultimoMovimiento.to === coordenada);
                  const tieneEfectoCaptura = casillaCapturaEfecto === coordenada;

                  return (
                    <div
                      key={`${rowIndex}-${colIndex}`}
                      onClick={() => manejarClickCasilla(rowIndex, colIndex)}
                      style={{
                        backgroundColor: tieneEfectoCaptura ? '#ef4444' : (estaSeleccionada ? '#f59e0b' : (esUltimoMovimiento ? 'rgba(250, 204, 21, 0.5)' : colorCasilla)),
                        width: '100%',
                        height: '100%',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: 'clamp(2rem, 7vw, 2.8rem)',
                        cursor: 'pointer',
                        position: 'relative',
                        userSelect: 'none',
                        transition: 'background-color 0.2s ease, transform 0.2s ease'
                      }}
                    >
                      {esMovimientoPosible && <div style={{ position: 'absolute', width: '28%', height: '28%', backgroundColor: 'rgba(16, 185, 129, 0.8)', borderRadius: '50%', zIndex: 2 }} />}
                      {square && (
                        <span style={{ 
                          color: coloresActuales[square.color], 
                          filter: es3D 
                            ? (square.color === 'w' ? 'drop-shadow(0px 5px 6px rgba(0,0,0,0.9))' : 'drop-shadow(0px 5px 5px rgba(255,255,255,0.5))')
                            : (square.color === 'w' ? 'drop-shadow(0px 2px 3px rgba(0,0,0,0.7))' : 'drop-shadow(0px 2px 2px rgba(255,255,255,0.3))'), 
                          lineHeight: 1, 
                          zIndex: 1,
                          display: 'inline-block',
                          transform: es3D 
                            ? (square.color === 'b' ? 'scale(1.18) translateY(-6px) translateZ(18px)' : 'scale(1.08) translateY(-4px) translateZ(18px)')
                            : (square.color === 'b' ? 'scale(1.08)' : 'scale(1)'),
                          transition: 'transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1), filter 0.3s ease'
                        }}>
                          {PIEZAS_UNICODE[square.color][square.type]}
                        </span>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Control Inferior */}
      <div style={{ marginTop: '12px', maxWidth: '440px', width: '100%' }}>
        <button onClick={reiniciarPartida} style={{ width: '100%', backgroundColor: '#d97706', color: '#fff', border: 'none', padding: '10px', borderRadius: '8px', fontWeight: 'bold', fontSize: '0.85rem', cursor: 'pointer' }}>
          🔄 Reiniciar Partida
        </button>
      </div>

    </div>
  );
}