export const calculateDeloreanSpeed = (currentSpeed, acceleration) => {
    const deloreanSpeed = currentSpeed + acceleration;
    return deloreanSpeed;
  };
  
  export const isTimeTravelReady = (speed) => {
    const isReady = speed >= 88;
    return isReady;
  };
  
  export const fluxCapacitorStatus = (energyLevel) => {
    const status = energyLevel < 1.21 ? 'insufficient power' : 'ready for time travel';
    return status;
  };
  
  export const formatDestination = (year, month, day) => {
    const formattedMonth = String(month).padStart(2, '0');
    const formattedDay = String(day).padStart(2, '0');
    const formattedDate = `${year}-${formattedMonth}-${formattedDay}`;
    return formattedDate;
  };