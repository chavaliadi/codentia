'use client';

import React, { useEffect, useRef, useState } from 'react';

interface MermaidProps {
    chart: string;
}

export default function Mermaid({ chart }: MermaidProps) {
    const ref = useRef<HTMLDivElement>(null);
    const [svg, setSvg] = useState<string>('');
    const [err, setErr] = useState<string>('');
    const [isClient, setIsClient] = useState(false);

    useEffect(() => {
        setIsClient(true);
    }, []);

    useEffect(() => {
        if (!isClient || !ref.current || !chart) return;
        
        let isMounted = true;
        const id = 'mermaid_' + Math.random().toString(36).slice(2, 9);
        
        async function renderChart() {
            try {
                // Dynamically import mermaid only on the client
                const mermaid = (await import('mermaid')).default;
                mermaid.initialize({
                    startOnLoad: false,
                    theme: 'dark',
                    securityLevel: 'loose',
                    themeVariables: {
                        background: '#0e0e1a',
                        primaryColor: '#818cf8',
                        lineColor: '#3d3d55',
                    }
                });

                setErr('');
                const { svg: renderedSvg } = await mermaid.render(id, chart.trim());
                if (isMounted) {
                    setSvg(renderedSvg);
                }
            } catch (error: any) {
                console.error("Mermaid Render Error:", error);
                if (isMounted) {
                    setErr("Failed to render graph. Try cleaning circular components.");
                }
            }
        }

        renderChart();

        return () => {
            isMounted = false;
        };
    }, [chart, isClient]);

    if (!isClient) {
        return <div className="mermaid-placeholder">Initializing graph...</div>;
    }

    if (err) {
        return <div className="mermaid-error">{err}</div>;
    }

    return (
        <div 
            ref={ref} 
            className="mermaid-graph" 
            dangerouslySetInnerHTML={{ __html: svg || '<div class="loading-ring"></div>' }} 
        />
    );
}
