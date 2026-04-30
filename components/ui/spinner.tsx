//Estiak

const Spinner = () => {
  return (
    <svg
      width="24"
      height="24"
      viewBox="0 0 24 24"
      xmlns="http://www.w3.org/2000/svg"
      className="size-8 stroke-primary"
    >
      <style>
        {`
            .spinner-rotating {
              transform-origin: center;
              animation: rotate-spinner 2s linear infinite;
            }
            .spinner-circle {
              stroke-linecap: round;
              animation: dash-animation 1.5s ease-in-out infinite;
            }
            @keyframes rotate-spinner {
              100% {
                transform: rotate(360deg);
              }
            }
            @keyframes dash-animation {
              0% {
                stroke-dasharray: 0 150;
                stroke-dashoffset: 0;
              }
              47.5% {
                stroke-dasharray: 42 150;
                stroke-dashoffset: -16;
              }
              95%, 100% {
                stroke-dasharray: 42 150;
                stroke-dashoffset: -59;
              }
            }
          `}
      </style>
      <g className="spinner-rotating">
        <circle
          cx="12"
          cy="12"
          r="9.5"
          fill="none"
          strokeWidth="2"
          className="spinner-circle"
        ></circle>
      </g>
    </svg>
  );
};

export default Spinner;
