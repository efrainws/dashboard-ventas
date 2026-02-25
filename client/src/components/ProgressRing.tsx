interface ProgressRingProps {
  percentage: number;
  size?: number;
  strokeWidth?: number;
}

export function ProgressRing({ percentage, size = 120, strokeWidth = 8 }: ProgressRingProps) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (Math.min(percentage, 100) / 100) * circumference;

  // Color basado en el cumplimiento
  const getColor = () => {
    if (percentage >= 100) return '#008064'; // Verde personalizado (positivo)
    if (percentage >= 75) return 'hsl(var(--primary))'; // Azul (progreso bueno)
    if (percentage >= 50) return 'hsl(var(--warning))'; // Amarillo (progreso medio)
    return '#BC2C46'; // Rojo personalizado (negativo)
  };

  const color = getColor();

  return (
    <div className="relative inline-flex items-center justify-center">
      <svg width={size} height={size} className="transform -rotate-90">
        {/* Background circle */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="hsl(var(--muted))"
          strokeWidth={strokeWidth}
        />
        {/* Progress circle */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          className="transition-all duration-500 ease-in-out"
        />
      </svg>
      {/* Percentage text */}
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-2xl font-bold" style={{ fontFamily: 'Italian Plate, serif' }}>
          {Math.round(percentage)}%
        </span>
      </div>
    </div>
  );
}
