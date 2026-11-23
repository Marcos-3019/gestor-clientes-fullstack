const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const client = {
  safeParse(data) {
    const issues = [];
    if (!data.name || data.name.length < 2 || data.name.length > 80) issues.push({field:"name",message:"El nombre debe tener entre 2 y 80 caracteres."});
    if (!emailPattern.test(data.email) || data.email.length > 120) issues.push({field:"email",message:"Introduce un correo electrónico válido."});
    if (!["lead","prospect","active"].includes(data.status)) issues.push({field:"status",message:"Selecciona un estado válido."});
    for (const field of ["company","phone","notes"]) if (data[field].length > (field==="notes"?500:100)) issues.push({field,message:"El campo supera la longitud permitida."});
    return issues.length ? {success:false,error:issues} : {success:true,data};
  }
};
module.exports={z:{client}};
