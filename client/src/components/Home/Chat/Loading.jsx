import React from 'react';

const Loading = () => {
    return (
        <div className="flex flex-col space-y-2">
            <div className="flex justify-center space-x-2">
                <div className="dot"></div>
                <div className="dot"></div>
                <div className="dot"></div>
            </div>
            <div className="flex justify-center space-x-2">
                <div className="dot"></div>
                <div className="dot"></div>
                <div className="dot"></div>
            </div>
            <div className="flex justify-center space-x-2">
                <div className="dot"></div>
                <div className="dot"></div>
                <div className="dot"></div>
            </div>

            <style >{`
                @keyframes colorChange {
                    0%, 100% {
                        background-color: #4A90E2; /* Initial color */
                    }
                    50% {
                        background-color: #50E3C2; /* Second color */
                    }
                }

                .dot {
                    width: 15px;
                    height: 15px;
                    border-radius: 50%;
                    animation: colorChange 1s infinite ease-in-out;
                }

                /* Animation delays for different rows */
                .dot:nth-child(1) { animation-delay: 0s; }
                .dot:nth-child(2) { animation-delay: 0.2s; }
                .dot:nth-child(3) { animation-delay: 0.4s; }
                .dot:nth-child(4) { animation-delay: 0.5s; }
                .dot:nth-child(5) { animation-delay: 0.7s; }
                .dot:nth-child(6) { animation-delay: 0.9s; }
                .dot:nth-child(7) { animation-delay: 1s; }
                .dot:nth-child(8) { animation-delay: 1.2s; }
                .dot:nth-child(9) { animation-delay: 1.4s; }
            `}</style>
        </div>
    );
};

export default Loading;  